"""
Backend OCR — FastAPI
Endpoint POST /ocr (multipart/form-data, campo "file")
Extrai texto de PDFs (nativo ou escaneado) e imagens (png, jpg, jpeg).
"""

import os
import tempfile
from typing import Final

import fitz  # PyMuPDF
import pytesseract
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pdf2image import convert_from_path
from PIL import Image

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
MAX_FILE_SIZE: Final[int] = int(os.getenv("OCR_MAX_FILE_SIZE", 10 * 1024 * 1024))  # 10 MB
MAX_PDF_PAGES: Final[int] = int(os.getenv("OCR_MAX_PDF_PAGES", 20))
TESSERACT_LANG: Final[str] = os.getenv("OCR_TESSERACT_LANG", "por+eng")
MIN_NATIVE_TEXT_LEN: Final[int] = 50  # abaixo disso, trata como PDF escaneado

ALLOWED_MIME_TYPES: Final[set[str]] = {
    "application/pdf",
    "image/png",
    "image/jpeg",
}

app = FastAPI(title="OCR Service", version="1.0.0")

# CORS — permitir qualquer origem durante desenvolvimento.
# Em produção, restrinja para o domínio do app.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
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
    Se o texto for muito curto (< MIN_NATIVE_TEXT_LEN), converte cada página
    em imagem a 300 DPI e roda OCR.
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

    # 2. Fallback: OCR via imagens
    try:
        images = convert_from_path(path, dpi=300)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao converter PDF em imagens para OCR: {exc}",
        )

    parts: list[str] = []
    for img in images:
        text: str = pytesseract.image_to_string(img, lang=TESSERACT_LANG)
        if text.strip():
            parts.append(text.strip())

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
async def ocr_endpoint(file: UploadFile = File(...)):
    """
    Recebe um arquivo (PDF, PNG, JPG/JPEG) e devolve o texto extraído.
    Retorna: { "texto": "..." }
    """

    # 1. Validar MIME type
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Tipo de arquivo não suportado: '{content_type}'. "
                f"Envie PDF, PNG ou JPG/JPEG."
            ),
        )

    # 2. Ler o conteúdo e validar tamanho
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

    # 3. Verificar magic bytes (não confiar apenas no content_type do cliente)
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

    # 4. Salvar em temporário e processar
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
