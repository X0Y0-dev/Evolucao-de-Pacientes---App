# Backend OCR — Serviço de Extração de Texto (FastAPI + Tesseract)

Microsserviço em Python/FastAPI responsável pelo processamento de documentos médicos (PDF nativo, PDF escaneado e imagens JPG/PNG) via Tesseract OCR e Poppler. Protegido por autenticação com Supabase Auth e controle de concorrência.

---

## 🔒 Variáveis de Ambiente

Crie um arquivo `.env` dentro de `backend-ocr/` baseado no `.env.example`:

```bash
cp .env.example .env
```

### Tabela de Configuração:
| Variável | Obrigatória | Padrão | Descrição |
|---|:---:|---|---|
| `SUPABASE_URL` | **Sim** | — | URL base do seu projeto Supabase (ex.: `https://xyzcompany.supabase.co`). |
| `SUPABASE_ANON_KEY` | **Sim** | — | Chave anônima pública do cliente Supabase. |
| `APP_ENV` | Não | `development` | Se definido como `production`, desativa `/docs`, `/redoc` e `/openapi.json`. |
| `OCR_MAX_CONCURRENT` | Não | `1` | Máximo de extrações simultâneas. Requisições excedentes recebem 503 com `Retry-After`. |
| `PORT` | Não | `8000` | Porta onde o Uvicorn escuta (injetada automaticamente pelo Railway). |
| `OCR_MAX_FILE_SIZE` | Não | `10485760` (10 MB) | Limite máximo em bytes do arquivo enviado. |
| `OCR_MAX_PDF_PAGES` | Não | `20` | Quantidade máxima de páginas permitida em PDFs. |
| `OCR_TESSERACT_LANG` | Não | `por+eng` | Pacotes de idiomas utilizados no reconhecimento OCR. |

> [!IMPORTANT]
> **Política Fail-Closed:** Se `SUPABASE_URL` ou `SUPABASE_ANON_KEY` não estiverem configuradas, o servidor **aborta a inicialização imediatamente com erro crítico nos logs**, recusando-se a subir sem autenticação ativa.

---

## 🚀 Execução Local com Docker

### 1. Construir a Imagem (Build)
```bash
docker build -t ocr-service .
```

### 2. Rodar o Container

#### Opção A: Via Docker Compose (Recomendado para Dev Local)
O arquivo `docker-compose.yml` lê automaticamente as variáveis de ambiente do seu `.env` local:
```bash
docker compose up --build
```
Para rodar em segundo plano:
```bash
docker compose up -d
```
Para parar:
```bash
docker compose down
```

#### Opção B: Via Docker Run
```bash
docker run -d --name ocr-service \
  --env-file .env \
  -p 8000:8000 ocr-service
```

---

## 🧪 Como Testar

### 1. Health Check (Público)
```bash
curl http://localhost:8000/health
```
**Resposta esperada:** `{"status":"ok"}` (código 200)

### 2. Documentação Interativa (Swagger)
- Em desenvolvimento (`APP_ENV=development`): abra no navegador `http://localhost:8000/docs`
- Em produção (`APP_ENV=production`): retorna `404 Not Found`.

### 3. Como Obter um Token JWT de Teste para o `/ocr`
Para testar o endpoint protegido via cURL, você precisa do access token de um usuário autenticado.

#### Passo 3.1: Obter o token via Supabase Auth REST API
```bash
curl -X POST "https://<SEU-PROJETO>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <SUA-SUPABASE-ANON-KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@exemplo.com",
    "password": "senha_do_usuario"
  }'
```
Copie o valor do campo `"access_token"` retornado no JSON.

#### Passo 3.2: Chamar o `/ocr` com o Token
```bash
curl -X POST "http://localhost:8000/ocr" \
  -H "Authorization: Bearer <SEU_ACCESS_TOKEN>" \
  -F "file=@exame.pdf"
```

### 4. Cenários de Erro Esperados
- **Sem header Authorization:** Retorna `HTTP 401` com `{"detail": "Não autorizado. Token de autenticação ausente ou inválido."}`
- **Token expirado ou inválido:** Retorna `HTTP 401` com `{"detail": "Não autorizado. Token de autenticação ausente ou inválido."}`
- **Servidor ocupado (limite de concorrência):** Retorna `HTTP 503` com header `Retry-After: 5` e `{"detail": "O servidor de OCR está ocupado processando outro documento. Tente novamente em alguns instantes."}`
- **Supabase fora do ar / timeout:** Retorna `HTTP 503` com `{"detail": "Não foi possível validar o login agora. Tente novamente."}`

---

## 🚂 Informações para Deploy no Railway

1. **Variáveis de Ambiente no Railway:** No painel do seu serviço no Railway, acesse **Variables** e adicione:
   - `SUPABASE_URL`: URL do projeto Supabase.
   - `SUPABASE_ANON_KEY`: Chave anônima pública do Supabase.
   - `APP_ENV`: `production` (para desativar a documentação pública).
   - `OCR_MAX_CONCURRENT`: `1` (recomendado para instâncias com 512 MB de RAM).
2. **Health Check Path:** Configure o caminho de verificação de saúde como `/health`.
3. **Porta Dinâmica:** O `Dockerfile` utiliza `CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]`, respeitando automaticamente a variável `${PORT}` atribuída pelo Railway.
