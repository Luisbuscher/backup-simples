# Backup Simples

Aplicação pequena para cadastrar bancos PostgreSQL, executar backups com
`pg_dump`, agendar execuções e enviar os arquivos para o Google Drive.

## Requisitos

- Docker com Docker Compose;
- um banco PostgreSQL externo para os dados da aplicação;
- acesso de rede do host Docker aos bancos que serão copiados;
- credenciais OAuth do Google Drive.

O Compose contém somente `frontend` e `backend`. Nenhum PostgreSQL é iniciado
localmente.

## Configuração

1. Copie `.env.example` para `.env` na raiz do projeto.
2. Preencha a conexão do PostgreSQL externo:

   ```env
   APP_DB_HOST=db.exemplo.com
   APP_DB_PORT=5432
   APP_DB_NAME=backup_app
   APP_DB_USER=backup_app
   APP_DB_PASSWORD=senha
   APP_DB_SSL=true
   ```

3. Preencha as credenciais administrativas. Use um `JWT_SECRET` aleatório com
   pelo menos 32 caracteres:

   ```env
   ADMIN_USER=admin
   ADMIN_PASSWORD=uma-senha-forte
   JWT_SECRET=um-segredo-longo-e-aleatorio-com-32-caracteres
   ```

4. Siga [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md) para preencher as variáveis do
   Google Drive.

5. Inicie a aplicação:

   ```bash
   docker compose up -d --build
   ```

6. Acesse `http://localhost:8080`.

As tabelas são criadas automaticamente na primeira inicialização. Se o
PostgreSQL externo exige TLS, mantenha `APP_DB_SSL=true`.

> Se um banco estiver instalado na mesma máquina do Docker, `localhost` dentro
> do container não aponta para o host. No Docker Desktop, use
> `host.docker.internal` no cadastro.

## Variáveis opcionais

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `APP_DB_SSL` | `false` | Ativa TLS na conexão do banco da aplicação |
| `TZ` | `America/Sao_Paulo` | Fuso usado nos nomes e agendamentos |
| `JWT_COOKIE_SECURE` | `false` | Deve ser `true` quando o acesso estiver sob HTTPS |
| `PORT` | `3000` | Porta interna do backend |

## Comportamento dos backups

- O arquivo usa o formato customizado do PostgreSQL (`pg_dump -Fc`).
- A senha do banco é passada somente pela variável de processo `PGPASSWORD`.
- O destino é a pasta do cadastro ou a pasta raiz do `.env`.
- O arquivo temporário é apagado após sucesso ou erro.
- Duas execuções do mesmo banco não são permitidas ao mesmo tempo.
- Horários perdidos enquanto o backend está desligado não são executados depois.
- Ao remover um cadastro, sua senha e configuração são apagadas; o histórico é
  preservado.

Por decisão de projeto, as senhas dos bancos cadastrados ficam em texto simples
no PostgreSQL externo. Restrinja cuidadosamente o acesso a esse banco e aos seus
backups.

## Desenvolvimento

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend, em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

O Vite encaminha `/api` para `http://localhost:3000`.

## Verificação

```bash
cd backend
npm test
npm run build

cd ../frontend
npm test
npm run build

cd ..
docker compose config
```
