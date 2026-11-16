"""
Backend OCR — FastAPI
Endpoint POST /ocr (multipart/form-data, campo "file")
Extrai texto de PDFs (nativo ou escaneado) e imagens (png, jpg, jpeg).
Protegido por autenticação Supabase Auth e com controle de concorrência.
"""

import asyncio
from contextlib import asynccontextmanager
import os
import tempfile
from typing import Final

import fitz  # PyMuPDF
import httpx
import pytesseract
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pdf2image import convert_from_path
from PIL import Image
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
SUPABASE_URL: Final[str] = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_ANON_KEY: Final[str] = os.getenv("SUPABASE_ANON_KEY", "").strip()
APP_ENV: Final[str] = os.getenv("APP_ENV", "development").strip().lower()
OCR_MAX_CONCURRENT: Final[int] = int(os.getenv("OCR_MAX_CONCURRENT", "1"))

MAX_FILE_SIZE: Final[int] = int(os.getenv("OCR_MAX_FILE_SIZE", 10 * 1024 * 1024))  # 10 MB
MAX_PDF_PAGES: Final[int] = int(os.getenv("OCR_MAX_PDF_PAGES", 20))
TESSERACT_LANG: Final[str] = os.getenv("OCR_TESSERACT_LANG", "por+eng")
MIN_NATIVE_TEXT_LEN: Final[int] = 50  # abaixo disso, trata como PDF escaneado

ALLOWED_MIME_TYPES: Final[set[str]] = {
    "application/pdf",
    "image/png",
    "image/jpeg",
}

# ---------------------------------------------------------------------------
# Estado Compartilhado e Ciclo de Vida (Lifespan)
# ---------------------------------------------------------------------------
http_client: httpx.AsyncClient | None = None
ocr_semaphore: asyncio.Semaphore | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gerencia recursos globais (cliente HTTP compartilhado e semáforo de concorrência).
    Fail-closed: se as variáveis de autenticação faltarem, aborta a inicialização.
    """
    global http_client, ocr_semaphore

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError(
            "ERRO CRÍTICO NA INICIALIZAÇÃO: Configuração de autenticação ausente. "
            "As variáveis de ambiente 'SUPABASE_URL' e 'SUPABASE_ANON_KEY' são obrigatórias "
            "para que o servidor de OCR possa operar em segurança."
        )

    http_client = httpx.AsyncClient(timeout=5.0)
    ocr_semaphore = asyncio.Semaphore(OCR_MAX_CONCURRENT)
    yield
    if http_client:
        await http_client.aclose()


# Desativa documentação interativa em ambiente de produção
is_production = APP_ENV == "production"

app = FastAPI(
    title="OCR Service",
    version="1.0.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
    lifespan=lifespan,
)

# Rejeição antecipada de requisições POST /ocr sem cabeçalho Authorization
# Impede o consumo de banda e buffering em disco/memória de arquivos multipart não autenticados
class EarlyAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/ocr" and request.method == "POST":
            auth = request.headers.get("Authorization")
            if not auth or not auth.startswith("Bearer ") or not auth[7:].strip():
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Não autorizado. Token de autenticação ausente ou inválido."},
                    headers={"WWW-Authenticate": "Bearer"},
                )
        return await call_next(request)


app.add_middleware(EarlyAuthMiddleware)

# CORS — permitir qualquer origem durante desenvolvimento.
# Em produção, restrinja para o domínio do app.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Autenticação (Supabase Auth)
# ---------------------------------------------------------------------------
security = HTTPBearer(auto_error=False)


async def exigir_usuario(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """
    Dependência reutilizável que valida o token JWT do usuário no Supabase Auth.
    - Token ausente, inválido ou expirado -> HTTP 401
    - Supabase inalcançável, timeout ou erro 5xx -> HTTP 503
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Não autorizado. Token de autenticação ausente ou inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Não autorizado. Token de autenticação ausente ou inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if http_client is None:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível validar o login agora. Tente novamente.",
        )

    verify_url = f"{SUPABASE_URL}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": SUPABASE_ANON_KEY,
    }

    try:
        resp = await http_client.get(verify_url, headers=headers)
    except (httpx.TimeoutException, httpx.NetworkError, httpx.RequestError):
        raise HTTPException(
            status_code=503,
            detail="Não foi possível validar o login agora. Tente novamente.",
        )

    if resp.status_code == 200:
        try:
            return resp.json()
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="Não foi possível validar o login agora. Tente novamente.",
            )
    elif resp.status_code in (400, 401, 403):
        raise HTTPException(
            status_code=401,
            detail="Não autorizado. Token de autenticação ausente ou inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    else:
        # Supabase retornou 5xx ou status inesperado
        raise HTTPException(
            status_code=503,
            detail="Não foi possível validar o login agora. Tente novamente.",
        )


# ---------------------------------------------------------------------------
# Helpers de extração
# ---------------------------------------------------------------------------

def _ocr_image(path: str) -> str:
    """Roda OCR em uma imagem (PNG/JPG/JPEG)."""
    img = Image.open(path)
    text: str = pytesseract.image_to_string(img, lang=TESSERACT_LANG)
    return text.strip()


def _extract_pdf(path: str) -> str:
    """
    Tenta extrair texto nativo do PDF.
    Se o texto for muito curto (< MIN_NATIVE_TEXT_LEN), converte página a página
    em imagem a 300 DPI e roda OCR com Tesseract, liberando a memória de cada
    página imediatamente antes de processar a próxima.
    """
    try:
        doc = fitz.open(path)
    except fitz.FileDataError:
        raise HTTPException(
            status_code=422,
            detail="O arquivo PDF está corrompido ou não pôde ser aberto.",
        )

    if doc.is_encrypted:
        doc.close()
        raise HTTPException(
            status_code=422,
            detail="O PDF está protegido por senha. Remova a senha e tente novamente.",
        )

    page_count = doc.page_count
    if page_count > MAX_PDF_PAGES:
        doc.close()
        raise HTTPException(
            status_code=422,
            detail=f"O PDF tem {page_count} páginas. O limite é {MAX_PDF_PAGES}.",
        )

    # 1. Tentar texto nativo
    native_text = ""
    for page in doc:
        native_text += page.get_text()
    doc.close()

    if len(native_text.strip()) >= MIN_NATIVE_TEXT_LEN:
        return native_text.strip()

    # 2. Fallback: OCR via imagens página a página (redução do pico de memória)
    parts: list[str] = []
    for page_num in range(1, page_count + 1):
        page_images = None
        try:
            try:
                page_images = convert_from_path(
                    path,
                    dpi=300,
                    first_page=page_num,
                    last_page=page_num,
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"Erro ao converter página {page_num} do PDF em imagem para OCR: {exc}",
                )

            if page_images:
                img = page_images[0]
                try:
                    text: str = pytesseract.image_to_string(img, lang=TESSERACT_LANG)
                    if text.strip():
                        parts.append(text.strip())
                finally:
                    img.close()
                    del img
        finally:
            if page_images:
                del page_images

    return "\n\n".join(parts)


def _process_file(tmp_path: str, content_type: str) -> str:
    """Despacha para o extrator correto."""
    if content_type == "application/pdf":
        return _extract_pdf(tmp_path)
    else:
        return _ocr_image(tmp_path)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@app.post("/ocr")
async def ocr_endpoint(
    file: UploadFile = File(...),
    _usuario: dict = Depends(exigir_usuario),
):
    """
    Recebe um arquivo (PDF, PNG, JPG/JPEG) e devolve o texto extraído.
    Retorna: { "texto": "..." }

    Requer autenticação via Bearer token do Supabase.
    Respeita semáforo de concorrência para proteger a memória do servidor.
    """

    # 1. Checagem de concorrência (autenticação já realizada com sucesso em Depends)
    if ocr_semaphore is not None and ocr_semaphore.locked():
        raise HTTPException(
            status_code=503,
            detail="O servidor de OCR está ocupado processando outro documento. Tente novamente em alguns instantes.",
            headers={"Retry-After": "5"},
        )

    # 2. Adquire o semáforo de concorrência para cobrir todo o ciclo de processamento
    async with (ocr_semaphore if ocr_semaphore is not None else asyncio.Lock()):
        # 3. Validar MIME type
        content_type = (file.content_type or "").lower()
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"Tipo de arquivo não suportado: '{content_type}'. "
                    f"Envie PDF, PNG ou JPG/JPEG."
                ),
            )

        # 4. Ler o conteúdo e validar tamanho
        try:
            contents = await file.read()
        except Exception:
            raise HTTPException(status_code=400, detail="Não foi possível ler o arquivo enviado.")

        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"O arquivo excede o limite de {MAX_FILE_SIZE // (1024 * 1024)} MB. "
                    f"Envie um arquivo menor."
                ),
            )

        # 5. Verificar magic bytes (não confiar apenas no content_type do cliente)
        if content_type == "application/pdf" and not contents[:5].startswith(b"%PDF"):
            raise HTTPException(
                status_code=415,
                detail="O arquivo não parece ser um PDF válido.",
            )

        if content_type == "image/png" and not contents[:8].startswith(b"\x89PNG"):
            raise HTTPException(
                status_code=415,
                detail="O arquivo não parece ser uma imagem PNG válida.",
            )

        if content_type == "image/jpeg" and not contents[:2].startswith(b"\xff\xd8"):
            raise HTTPException(
                status_code=415,
                detail="O arquivo não parece ser uma imagem JPEG válida.",
            )

        # 6. Salvar em temporário e processar
        suffix = {
            "application/pdf": ".pdf",
            "image/png": ".png",
            "image/jpeg": ".jpg",
        }.get(content_type, "")

        tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            with os.fdopen(tmp_fd, "wb") as tmp_file:
                tmp_file.write(contents)

            # run_in_threadpool evita bloquear o event loop do FastAPI
            texto = await run_in_threadpool(_process_file, tmp_path, content_type)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Erro interno durante a extração de texto: {exc}",
            )
        finally:
            # Sempre limpar o temporário
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        return {"texto": texto}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}
