# Evolução de Pacientes — App Mobile & Serviço de OCR

Aplicativo móvel em React Native (Expo SDK 58) para registrar a evolução clínica de pacientes: cadastro do paciente, criação de relatórios com anexo (PDF ou imagem), transcrição automática de documentos por OCR e compartilhamento por e-mail e WhatsApp.

> O nome exibido no celular é **Relatório de Evolução**. O nome do projeto/repositório continua sendo *Evolução de Pacientes*.

---

## Sumário

- [Evolução de Pacientes — App Mobile \& Serviço de OCR](#evolução-de-pacientes--app-mobile--serviço-de-ocr)
  - [Sumário](#sumário)
  - [Visão geral](#visão-geral)
  - [Estrutura do repositório](#estrutura-do-repositório)
  - [Pré-requisitos](#pré-requisitos)
  - [Variáveis de ambiente](#variáveis-de-ambiente)
    - [App (`.env` na raiz)](#app-env-na-raiz)
    - [Backend (`backend-ocr/.env`)](#backend-backend-ocrenv)
  - [Desenvolvimento local](#desenvolvimento-local)
    - [1. Backend (terminal 1)](#1-backend-terminal-1)
    - [2. Aplicativo (terminal 2)](#2-aplicativo-terminal-2)
  - [Backend de OCR](#backend-de-ocr)
  - [Deploy do backend no Railway](#deploy-do-backend-no-railway)
  - [Build e distribuição do app (Android)](#build-e-distribuição-do-app-android)
  - [Atualizações OTA (EAS Update)](#atualizações-ota-eas-update)
  - [Compartilhamento de relatórios](#compartilhamento-de-relatórios)
    - [E-mail](#e-mail)
    - [WhatsApp](#whatsapp)
  - [Segurança e privacidade](#segurança-e-privacidade)
  - [Testes](#testes)
  - [iOS](#ios)
  - [Problemas comuns](#problemas-comuns)
  - [Pendências conhecidas](#pendências-conhecidas)
  - [Licença](#licença)

---

## Visão geral

```
┌────────────────────────┐        ┌─────────────────────────────┐
│  App (Expo / RN)       │───────►│  Supabase                   │
│  Android (testado)     │        │  Auth · Postgres · Storage  │
│  iOS (não testado)     │        └──────────────▲──────────────┘
└───────────┬────────────┘                       │ valida o token
            │ POST /ocr (Bearer token)           │
            ▼                                    │
┌────────────────────────────────────────────────┴──┐
│  Backend OCR (FastAPI em Docker, hospedado no     │
│  Railway): PyMuPDF · Poppler · Tesseract          │
└───────────────────────────────────────────────────┘
```

**Funcionalidades**

- Login com Supabase Auth.
- Cadastro e edição de pacientes (com foto).
- Relatórios com status *em andamento* ou *finalizado*, comentário e anexo (`.pdf`, `.png`, `.jpg`, `.jpeg`).
- Transcrição de anexos para texto (PDF com texto, PDF escaneado e imagens).
- Compartilhamento por **e-mail** (Para, CC e CCO, com anexo) e por **WhatsApp** (somente texto).
- Atualizações do código sem reinstalar o app (EAS Update).

**Tecnologias**

| Camada | Tecnologias |
| :--- | :--- |
| App | React Native, Expo SDK 58, TypeScript, React Navigation, Development Build |
| Dados e autenticação | Supabase (Postgres, Auth, Storage com buckets privados) |
| OCR | Python 3.12, FastAPI, Uvicorn, PyMuPDF, pdf2image (Poppler), pytesseract (Tesseract), httpx |
| Infraestrutura | Docker, Railway (backend), EAS Build e EAS Update (app) |

---

## Estrutura do repositório

```
.
├── App.tsx / index.ts          # Ponto de entrada e navegação
├── app.json / app.config.js    # Configuração do Expo (config dinâmica por APP_ENV)
├── eas.json                    # Perfis de build e canais de atualização
├── assets/                     # Ícone, splash e logo
├── src/
│   ├── components/             # Componentes compartilhados (ex.: Header)
│   ├── context/                # AppContext (pacientes, relatórios, tema)
│   ├── contexts/               # AuthContext (sessão)
│   ├── lib/supabase.ts        # Cliente Supabase
│   ├── screens/                # Telas (Login, Home, PatientForm, ReportForm...)
│   ├── services/compartilhamento/  # Montagem do conteúdo, e-mail e WhatsApp
│   ├── types/                  # Tipos TypeScript
│   └── utils/                  # OCR, upload, storage, máscaras, validadores
├── backend-ocr/                # Serviço de OCR (Dockerfile, main.py, README próprio)
└── supabase/                   # Configuração local da CLI (config.toml)
```

O backend tem documentação própria em [`backend-ocr/README.md`](backend-ocr/README.md).

---

## Pré-requisitos

- **Node.js** e **npm**.
- **EAS CLI** (`npm install -g eas-cli`) e uma conta no [Expo](https://expo.dev).
- **Docker Desktop** (no Windows, mantenha-o **aberto** ao usar o comando `docker`).
- Projeto no **Supabase** e conta no **Railway** (para o deploy).
- Python 3.12 apenas se for rodar o backend **sem Docker** (e, nesse caso, instalar Tesseract e Poppler no sistema).

---

## Variáveis de ambiente

> Nunca versione arquivos `.env` reais. Apenas os `.env.example` entram no repositório.

### App (`.env` na raiz)

| Variável | Uso |
| :--- | :--- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon/publishable) do Supabase |
| `EXPO_PUBLIC_OCR_URL` | URL do backend de OCR (ex.: `http://192.168.0.15:8000` em desenvolvimento; `https://<seu-serviço>.up.railway.app` em produção). Aceita com ou sem `/ocr` no final |
| `APP_ENV` | `production` nos builds de entrega (bloqueia HTTP em texto puro). Em desenvolvimento, deixe sem definir |

Variáveis `EXPO_PUBLIC_*` são **embutidas no app** no momento do build ou da atualização: são públicas por natureza. Nunca coloque ali chaves secretas (como `service_role`).

### Backend (`backend-ocr/.env`)

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :---: | :---: | :--- |
| `SUPABASE_URL` | Sim | — | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Sim | — | Chave pública usada para validar o token do usuário |
| `APP_ENV` | Não | — | Com `production`, `/docs`, `/redoc` e `/openapi.json` ficam desativados |
| `OCR_MAX_CONCURRENT` | Não | `1` | OCRs simultâneos (acima disso, responde 503) |
| `OCR_MAX_FILE_SIZE` | Não | 10 MB | Tamanho máximo do arquivo, em bytes |
| `OCR_MAX_PDF_PAGES` | Não | `20` | Máximo de páginas por PDF |
| `OCR_TESSERACT_LANG` | Não | `por+eng` | Idiomas do Tesseract |
| `PORT` | Não | `8000` | Porta (o Railway define automaticamente) |

Se `SUPABASE_URL` ou `SUPABASE_ANON_KEY` faltarem, o servidor **se recusa a iniciar** de propósito.

---

## Desenvolvimento local

São necessários **dois terminais**: um para o backend e outro para o app.

### 1. Backend (terminal 1)

```bash
cd backend-ocr
cp .env.example .env        # Windows (PowerShell): Copy-Item .env.example .env
# edite o .env com SUPABASE_URL e SUPABASE_ANON_KEY
docker compose up --build
```

Confira em `http://localhost:8000/health` (deve responder `{"status":"ok"}`) e `http://localhost:8000/docs`.

Para simular os limites do Railway (512 MB de RAM e 1 vCPU) localmente:

```bash
docker compose -f docker-compose.yml -f docker-compose.limite.yml up --build
```

Esse arquivo é só para teste local e não é usado no deploy.

### 2. Aplicativo (terminal 2)

1. Em um celular físico, `localhost` aponta para o próprio celular. Use o **IP do computador** na rede Wi-Fi (`ipconfig` no Windows, `ifconfig` ou `ip a` no Linux/Mac) em `EXPO_PUBLIC_OCR_URL`, com celular e computador na **mesma rede**.
2. Libere a porta `8000` no firewall do computador. No Windows (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "OCR 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
   ```
3. Instale as dependências e inicie o Metro limpando o cache (necessário sempre que o `.env` mudar):
   ```bash
   npm install
   npx expo start --dev-client -c
   ```

O app roda em um **Development Build** (não no Expo Go). Para gerar um:

```bash
eas build --profile development --platform android
```

> **Atenção:** mudanças em configuração **nativa** (`app.json`, `app.config.js`, plugins, ícone, nome, permissões ou novas bibliotecas nativas) **não** são aplicadas por reload do Metro nem por atualização OTA. Exigem um novo build.

> **HTTP em desenvolvimento:** o `app.config.js` libera tráfego HTTP em texto puro (`usesCleartextTraffic` no Android e `NSAllowsArbitraryLoads` no iOS) **apenas** quando `APP_ENV` não é `production`. Builds de entrega devem sempre usar `APP_ENV=production` e um backend com HTTPS.

---

## Backend de OCR

**Endpoints**

| Método e rota | Autenticação | Descrição |
| :--- | :---: | :--- |
| `GET /health` | Não | Verificação de disponibilidade |
| `POST /ocr` | **Sim** (`Authorization: Bearer <token>`) | Recebe `file` (multipart) e devolve `{"texto": "..."}` |

**Como funciona**

1. Um middleware rejeita imediatamente (401) requisições `POST /ocr` sem header `Authorization: Bearer ...`, antes de receber o arquivo.
2. O token é validado consultando o Supabase Auth. Token inválido ou expirado resulta em **401**. Falha ao consultar o Supabase (fora do ar, timeout) resulta em **503**, nunca em 401.
3. Apenas um OCR roda por vez (configurável). Se estiver ocupado, responde **503** com `Retry-After`.
4. Tipo de arquivo aceito: PDF, PNG e JPEG (tipo inválido resulta em **415**).
5. Em PDFs, tenta primeiro o texto nativo (PyMuPDF). Se vier praticamente vazio, trata como escaneado: renderiza **uma página por vez** a 300 DPI (Poppler), roda o Tesseract e libera a imagem antes da próxima página, mantendo o consumo de memória baixo.
6. O arquivo recebido é gravado em um temporário e **sempre removido** ao final.

**Referência de desempenho** (medida localmente, PDF de 20 páginas só de imagem, container limitado a 512 MB e 1 vCPU): pico de memória de cerca de 173 MiB e 20 a 25 segundos. Antes do processamento página a página, o mesmo arquivo chegava a cerca de 860 MiB, acima do limite de 512 MB. Os números dependem do arquivo e da máquina.

**Testando com `curl`**

Obtenha um token de teste com o seu usuário (nunca compartilhe ou versione o token):

```bash
curl -X POST "https://<SEU-PROJETO>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <SUA-CHAVE-PUBLICA>" -H "Content-Type: application/json" \
  -d '{"email":"<email>","password":"<senha>"}'
```

Depois chame o OCR com o `access_token` retornado:

```bash
curl -i -X POST http://localhost:8000/ocr \
  -H "Authorization: Bearer <access_token>" -F "file=@teste.png"
```

Resultados esperados: sem token → 401, token falso → 401, token válido → 200 com o texto. No PowerShell, use `curl.exe` (o comando `curl` é um apelido de outro programa). O token expira em cerca de uma hora.

---

## Deploy do backend no Railway

O repositório contém o app na raiz e o backend em `backend-ocr/`, então o serviço do Railway precisa apontar para essa pasta. Os nomes exatos das opções podem variar no painel.

1. Crie um projeto no Railway a partir do repositório do GitHub (se for privado, conceda acesso ao Railway).
2. Em *Settings* do serviço, defina o **Root Directory** como `backend-ocr` (o Railway usará o `Dockerfile` dessa pasta).
3. Em *Variables*, cadastre: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_ENV=production` e `OCR_MAX_CONCURRENT=1`. Não defina `PORT`.
4. Configure o **health check** em `/health` e gere o **domínio público** (HTTPS).
5. Teste pela URL pública:
   ```bash
   curl -i https://<seu-serviço>.up.railway.app/health        # 200
   curl -i https://<seu-serviço>.up.railway.app/docs          # 404 em produção
   curl -i -X POST https://<seu-serviço>.up.railway.app/ocr -F "file=@teste.png"   # 401
   ```
6. Envie um PDF escaneado com um token válido e observe o uso de memória no painel do Railway. Confira o limite de recursos do seu plano.
7. Coloque a URL do serviço em `EXPO_PUBLIC_OCR_URL` nos perfis de build do `eas.json` (próxima seção).

---

## Build e distribuição do app (Android)

**Perfis** (`eas.json`): `development` (Development Build, uso do desenvolvedor), `preview` (teste interno) e `production` (entrega).

Os perfis `preview` e `production` devem definir:

- `channel` (`preview` e `production`, respectivamente), para receber atualizações OTA;
- `env.APP_ENV = "production"`, para bloquear HTTP em texto puro;
- `env.EXPO_PUBLIC_OCR_URL` com a **URL pública do Railway** (e nunca um IP local).

Gerar o APK de entrega:

```bash
eas build -p android --profile production
```

Na primeira vez, o EAS cria a **keystore** de assinatura do Android. **Guarde-a**: sem ela não é possível publicar atualizações do aplicativo.

**Antes de entregar o APK**

- Instale-o no seu aparelho e teste o fluxo completo (login, paciente, relatório, OCR de imagem e PDF, e-mail, WhatsApp e comportamento sem internet).
- Teste uma atualização OTA (próxima seção).
- Quem instalar precisará permitir a instalação de apps de fontes desconhecidas, e o Android pode exibir um aviso de segurança (esperado para APK fora da Play Store).

---

## Atualizações OTA (EAS Update)

O app usa `expo-updates` com `runtimeVersion` baseado em `fingerprint`. Uma atualização só chega a builds com a **mesma impressão digital nativa**.

| Tipo de mudança | Como entregar |
| :--- | :--- |
| Código JavaScript/TypeScript, telas, textos, estilos, imagens usadas no código | `eas update` (sem reinstalar) |
| Bibliotecas nativas, permissões, plugins, ícone, nome do app, configuração nativa | Novo build (novo APK) |

**Fluxo recomendado**

```bash
# 1. Publique primeiro no canal de teste e valide em um aparelho com build preview
eas update --channel preview --message "descrição da mudança"

# 2. Depois publique para a produção
eas update --channel production --message "descrição da mudança"
```

**Cuidados**

- O código da atualização é empacotado **na sua máquina**, lendo o seu `.env` local. Antes de publicar, garanta que `EXPO_PUBLIC_OCR_URL` aponta para o backend de produção (e não para o IP local) e confirme na documentação do EAS como definir variáveis por ambiente. Teste no canal `preview` antes de enviar para `production`.
- Por padrão, a atualização é baixada em segundo plano e aplicada na **próxima abertura** do app. Hoje não há aviso visual na tela. Evite recarregar o app durante a edição de um relatório.
- Para reverter, republique a atualização anterior (confirme o comando na documentação do EAS).
- Atualizações não funcionam em Development Build nem com `__DEV__` ativo.

---

## Compartilhamento de relatórios

### E-mail

Usa o `expo-mail-composer`: abre o aplicativo de e-mail do celular com destinatários (**Para, CC e CCO**), assunto, texto e anexo preenchidos, e a usuária toca em enviar. O e-mail sai da conta dela, sem servidor de envio nem provedor de terceiros.

- O anexo é baixado do Supabase Storage por URL assinada temporária para o cache do aparelho e removido depois (no Android, com atraso, para o app de e-mail concluir a leitura).
- O app não consegue confirmar se a usuária de fato enviou o e-mail.
- Exige um app de e-mail configurado no aparelho.

### WhatsApp

Abre a folha de compartilhamento do sistema (`Share`) com o texto do relatório. **Somente texto**: o link `wa.me` e o compartilhamento de texto não permitem anexar arquivos, e a API oficial do WhatsApp é paga e voltada a envio automático.

Evolução possível: gerar um PDF único (relatório + comentário) e compartilhá-lo com `expo-print` e `expo-sharing`.

> Antes de compartilhar, o app exibe um aviso para confirmar que não há dados que identifiquem o paciente. Verifique com a instituição de ensino ou de trabalho as regras sobre compartilhamento de dados de pacientes.

---

## Segurança e privacidade

O app trata **dados de saúde**. Pontos importantes:

- **Backend protegido:** `/ocr` exige login válido; sem as variáveis do Supabase o servidor não inicia; documentação interativa desativada em produção; um OCR por vez.
- **Nada de segredos no app:** apenas a chave pública (anon/publishable) do Supabase. Nunca use a `service_role` no app ou no backend de OCR.
- **Sem logs de conteúdo:** o backend não registra tokens nem texto de documentos, e o app não deve registrar dados de pacientes fora de `__DEV__`.
- **Dados em trânsito:** em produção, apenas HTTPS.
- **Arquivos temporários:** removidos após o uso no backend e no cache do app.
- **Configurações no painel do Supabase (não versionadas neste repositório):**
  - desativar o cadastro de novos usuários, para que apenas contas autorizadas façam login;
  - manter o **RLS** ativo em `pacientes`, `relatorios` e `perfis`, com políticas de acesso por usuário;
  - manter os buckets `pacientes_fotos` e `relatorios_arquivos` **privados**.
  Teste o RLS sem login com a chave pública: as consultas devem voltar vazias ou ser negadas.
- **Backup:** o esquema do banco não está versionado aqui. Mantenha um dump do esquema e verifique a política de backup do seu plano do Supabase.
- Este README não é aconselhamento jurídico. Para uso profissional, confirme com a instituição as exigências da LGPD e do conselho da categoria.

---

## Testes

Não há testes automatizados. A validação é manual. Roteiro mínimo:

1. `/health` responde 200 e `/docs` responde 404 em produção.
2. `POST /ocr` sem token → 401; token falso → 401; token válido → 200.
3. No app: PDF com texto, PDF escaneado de várias páginas, imagem (JPG/PNG) e tipo inválido.
4. Sessão expirada (deslogar e tentar transcrever) e backend desligado, com mensagens corretas.
5. Duas transcrições simultâneas: a segunda recebe 503 ("servidor ocupado").
6. E-mail com Para, CC, CCO e anexo; WhatsApp; relatório não salvo.
7. Atualização OTA publicada no canal `preview` chegando ao aparelho.

---

## iOS

O projeto é multiplataforma, mas foi desenvolvido e **testado apenas em Android**. Para publicar em iPhone é necessário:

- conta **Apple Developer** (paga) e perfil de build iOS no `eas.json`;
- distribuição por TestFlight ou instalação restrita a aparelhos cadastrados (não existe instalação de arquivo avulso como o APK);
- teste em um **iPhone real**.

Pontos de atenção identificados por análise do código (não confirmados em aparelho):

- textos de permissão de fotos (e câmera, se usada) no `Info.plist` via plugin do `expo-image-picker`;
- `supportsTablet` (a interface foi desenhada para celular);
- fotos em formato **HEIC** podem ser recusadas pelo OCR, que aceita PDF, PNG e JPEG;
- o e-mail depende de uma conta no app **Mail** da Apple;
- `keyboardVerticalOffset`, áreas seguras e teclado numérico.

---

## Problemas comuns

| Sintoma | Causa provável e solução |
| :--- | :--- |
| "Não foi possível alcançar o servidor de OCR" | `EXPO_PUBLIC_OCR_URL` incorreta ou apontando para `localhost`, backend desligado, firewall bloqueando a porta, celular em outra rede, ou build antigo sem a permissão de HTTP. Reinicie o Metro com `-c` após mudar o `.env` |
| "Sessão expirada, faça login novamente" | Sem sessão ativa ou token recusado (401). Faça login novamente |
| "Servidor ocupado" / 503 | Outro OCR em andamento ou falha ao validar o login no Supabase. Tente novamente em instantes |
| `Unsupported FormDataPart implementation` | O envio principal falhou ao montar o `FormData`; o app aciona automaticamente o envio nativo (`FileSystem.uploadAsync`) |
| `docker` não reconhecido / não conecta ao daemon | Instale e **abra** o Docker Desktop; reabra o terminal |
| `no configuration file provided` | Execute o comando dentro de `backend-ocr/`, onde está o `docker-compose.yml` |
| `env file ... .env not found` | Crie `backend-ocr/.env` a partir do `.env.example` |
| Servidor encerra ao iniciar | Faltam `SUPABASE_URL` ou `SUPABASE_ANON_KEY` (comportamento intencional) |
| `curl` com resultado estranho no Windows | Use `curl.exe` no PowerShell |
| `tesseract is not installed` | Só ocorre fora do Docker. Instale Tesseract (com português) e Poppler, ou use o Docker |
| Build de produção com HTTP liberado | `APP_ENV=production` não foi definido no perfil do `eas.json` |

---

## Pendências conhecidas

- Telas muito grandes (`ReportForm`, `Home`) concentram várias responsabilidades e merecem divisão em componentes menores.
- Versionar o esquema e as políticas de RLS do Supabase (`supabase/migrations`).
- Adicionar testes automatizados.
- Aviso visual de nova versão com confirmação antes de aplicar a atualização.
- Preparar e testar a versão iOS.
- Unificar as pastas `context/` e `contexts/`.

---

## Licença

Veja o arquivo [`LICENSE`](LICENSE).