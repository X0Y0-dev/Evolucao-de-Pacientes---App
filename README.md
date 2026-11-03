# Evolução de Pacientes — App Mobile & Serviço de OCR

Aplicativo móvel desenvolvido em React Native com Expo (SDK 58) e backend complementar de extração de texto (OCR) via FastAPI.

---

## 📡 Configuração do Serviço de OCR na Rede Local

### 1. Subir o Backend OCR

O serviço Python/FastAPI deve ser executado escutando em todas as interfaces de rede (`0.0.0.0`) para que dispositivos na mesma rede Wi-Fi consigam alcançá-lo:

```bash
cd backend-ocr

# Opção A: Com Docker (Recomendado)
docker build -t ocr-service .
docker run -p 8000:8000 ocr-service

# Opção B: Direto com Python
python -m venv .venv
# Windows: .venv\Scripts\activate | Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

> **Atenção:** Certifique-se de que o firewall do seu computador permita conexões de entrada na porta `8000`.

---

### 2. Configurar a URL no `.env` do Aplicativo

Em um **dispositivo móvel físico**, `localhost` aponta para o próprio celular e **não** para o seu computador.

1. Descubra o IP local do seu computador na rede Wi-Fi:
   * **Windows:** execute `ipconfig` no prompt e veja o campo *Endereço IPv4* (ex.: `192.168.0.15`).
   * **Linux/Mac:** execute `ip a` ou `ifconfig`.
2. Configure a variável no arquivo `.env`:
   ```env
   # Substitua pelo IP local da sua máquina:
   EXPO_PUBLIC_OCR_URL=http://192.168.0.15:8000
   ```
   *(Tanto `http://192.168.0.15:8000` quanto `http://192.168.0.15:8000/ocr` são aceitos).*

---

### ⚠️ Importante: Tráfego Cleartext HTTP e Development Build

Por padrão, sistemas modernos (Android 9+ e iOS com ATS) bloqueiam conexões `http://` não criptografadas.

O arquivo `app.config.js` está configurado para permitir `usesCleartextTraffic` (Android) e `NSAllowsArbitraryLoads` (iOS) **apenas fora de produção** (`APP_ENV !== 'production'`).

> 🚨 **Aviso Importante sobre Development Build:**
> Alterações em arquivos de configuração nativa (`app.json` / `app.config.js`) **NÃO** são aplicadas por um simples reload do Metro bundler.
> Para que as permissões de rede HTTP em desenvolvimento tenham efeito no aplicativo instalado, você deve **gerar um novo Development Build** (ex.: via `eas build --profile development` ou `npx expo run:android` / `npx expo run:ios`).

---

## 🧪 Checklist de Testes

Siga estes 5 passos para validar o funcionamento ponta a ponta:

1. **Acessar `/docs` no navegador do celular:**
   * Conecte o celular na mesma rede Wi-Fi do computador.
   * Abra o navegador do celular (Chrome ou Safari) e acesse: `http://<SEU_IP_LOCAL>:8000/docs`.
   * *Resultado esperado:* A interface Swagger do FastAPI deve carregar normalmente. Se não carregar, verifique firewall e IP.
2. **Enviar PDF nativo:**
   * No app, abra um relatório, anexe um PDF com texto selecionável e toque em "Transcrever arquivo".
   * *Resultado esperado:* O texto é extraído via PyMuPDF de forma rápida e adicionado ao campo de relatório.
3. **Enviar PDF escaneado:**
   * Anexe um PDF composto por imagens escaneadas (sem texto digital nativo).
   * *Resultado esperado:* O backend converte as páginas em 300 DPI e roda Tesseract OCR; o texto é concatenado com sucesso.
4. **Enviar Imagem (JPG/PNG):**
   * Anexe uma foto de documento da galeria ou câmera.
   * *Resultado esperado:* O texto é extraído pelo OCR direto e adicionado ao relatório.
5. **Testar com Backend Desligado (Erro de Rede):**
   * Encerre o container ou pare o `uvicorn` no terminal do computador.
   * Toque em "Transcrever arquivo" no app.
   * *Resultado esperado:* O app exibe o alerta: `"Não foi possível alcançar o servidor de OCR."` com o botão `"Tentar novamente"`.
