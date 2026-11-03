FROM python:3.12-slim

# Dependências de sistema para Tesseract e pdf2image (poppler)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-por \
    tesseract-ocr-eng \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000

# Variáveis de ambiente configuráveis (com defaults seguros)
ENV OCR_MAX_FILE_SIZE=10485760
ENV OCR_MAX_PDF_PAGES=20
ENV OCR_TESSERACT_LANG=por+eng

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
