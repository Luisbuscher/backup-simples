# Backup Simples

Aplicação multiusuário para cadastrar bancos PostgreSQL, executar e agendar
backups e enviar os arquivos para o Google Drive de cada usuário.

## Requisitos

- Docker com Docker Compose;
- um banco PostgreSQL externo para os dados da aplicação;
- acesso de rede do backend aos bancos que serão copiados;
- credenciais OAuth do Google e, em produção, uma conta Resend.

## Configuração

Copie `.env.example` para `.env` e configure:

```env
APP_DB_HOST=db.exemplo.com
APP_DB_PORT=5432
APP_DB_NAME=backup_app
APP_DB_USER=backup_app
APP_DB_PASSWORD=senha
APP_DB_SSL=true

APP_BASE_URL=https://backup.seudominio.com

GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret

EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Backup Simples <contato@seudominio.com>

JWT_SECRET=um-segredo-aleatorio-com-pelo-menos-32-caracteres
DATA_ENCRYPTION_KEY=outro-segredo-aleatorio-com-pelo-menos-32-caracteres
JWT_COOKIE_SECURE=true
```

`APP_BASE_URL` deve ser a URL pública, sem barra final. Em desenvolvimento, use
`http://localhost`. `JWT_COOKIE_SECURE` deve ser `true` sob HTTPS.

Para testar o cadastro sem enviar e-mails, use `EMAIL_DELIVERY_MODE=log`. O link
de confirmação será escrito no log do backend. Em produção, use `resend` e
configure a chave e um remetente validado no Resend.

Não troque `DATA_ENCRYPTION_KEY` depois de cadastrar bancos ou conectar contas
Google: ela protege as senhas e os refresh tokens armazenados. Guarde-a em um
gerenciador de segredos e nunca versione o `.env`.

Consulte [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md) para preparar o OAuth.

## Execução

```bash
docker compose up -d --build
```

Acesse a URL definida em `APP_BASE_URL`, crie uma conta, confirme o e-mail e
clique em **Conectar Google Drive**. A pasta **Backup Simples** será localizada
ou criada automaticamente no Drive autorizado.

As tabelas e migrações compatíveis são aplicadas na inicialização. Ao atualizar
uma instalação antiga, a primeira conta criada assume os bancos e históricos
legados sem proprietário; as senhas legadas são criptografadas nessa operação.

## Isolamento e segurança

- Toda consulta de bancos e históricos é filtrada pelo usuário autenticado.
- Senhas de acesso são derivadas com `scrypt` e salt individual.
- Senhas dos bancos e refresh tokens do Google usam AES-256-GCM em repouso.
- Tokens de confirmação são aleatórios, armazenados apenas como hash e expiram
  em 24 horas.
- A sessão fica em cookie `HttpOnly` e `SameSite=Strict`.
- A integração Google solicita somente `drive.file`, limitando o acesso aos
  arquivos e pastas criados/abertos pela aplicação.
- Arquivos temporários são removidos após sucesso ou erro.

## Variáveis opcionais

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `APP_DB_SSL` | `false` | Ativa TLS no banco da aplicação |
| `APP_BASE_URL` | `http://localhost` | URL usada nos links de e-mail e callback OAuth |
| `EMAIL_DELIVERY_MODE` | `log` | `log` em desenvolvimento ou `resend` em produção |
| `TZ` | `America/Sao_Paulo` | Fuso dos nomes e agendamentos |
| `JWT_COOKIE_SECURE` | `false` | Exige HTTPS para o cookie |
| `PORT` | `3000` | Porta interna do backend |

## Desenvolvimento e verificação

```bash
cd backend
npm install
npm test
npm run build

cd ../frontend
npm install
npm test
npm run build
```

O Vite encaminha `/api` para `http://localhost:3000`.
