# 1. Imagem base oficial estável e enxuta (Python 3.12 Slim)
FROM python:3.12-slim

# 2. Instalação de dependências do sistema operacional
# - tesseract-ocr: motor OCR principal
# - tesseract-ocr-por & tesseract-ocr-eng: dados de treinamento de português e inglês
# - poppler-utils: utilitários (pdftoppm, pdfinfo) exigidos pelo pdf2image
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-por \
    tesseract-ocr-eng \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# 3. Criação de usuário sem privilégios administrativos (non-root)
RUN useradd -m -u 1000 appuser

# 4. Diretório de trabalho da aplicação
WORKDIR /app

# 5. Cópia e instalação de dependências Python (camada isolada para otimização de cache Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. Cópia do código-fonte e ajuste de propriedade para o usuário da aplicação
COPY main.py .
RUN chown -R appuser:appuser /app

# 7. Troca para o usuário não-root
USER appuser

# 8. Variáveis de ambiente operacionais padrão (configuráveis pelo Railway/compose)
ENV PYTHONUNBUFFERED=1 \
    OCR_MAX_FILE_SIZE=10485760 \
    OCR_MAX_PDF_PAGES=20 \
    OCR_TESSERACT_LANG=por+eng

# 9. Documentação da porta padrão para tráfego local
EXPOSE 8000

# 10. Comando de inicialização via shell para suportar a porta dinâmica ($PORT) injetada pelo Railway
# Caso a variável $PORT não esteja definida (ex: desenvolvimento local), assume 8000 como padrão
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
