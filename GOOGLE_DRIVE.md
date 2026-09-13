# Google Drive por usuário

O Backup Simples usa OAuth 2.0 para que cada usuário conecte sua própria conta.
Não é necessário gerar refresh token nem informar ID de pasta manualmente.

## 1. Preparar o projeto Google

1. No [Google Cloud Console](https://console.cloud.google.com/), crie ou escolha
   um projeto.
2. Em **APIs e serviços → Biblioteca**, ative a **Google Drive API**.
3. Configure a tela de consentimento OAuth como **Interna** ou **Externa**.
4. Em aplicativos externos em teste, adicione as contas permitidas como
   usuários de teste.

A aplicação solicita estes escopos:

```text
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/userinfo.email
```

`drive.file` permite gerenciar somente arquivos e pastas criados ou abertos
pela aplicação, sem acesso geral ao conteúdo do Drive.

## 2. Criar as credenciais

1. Abra **APIs e serviços → Credenciais**.
2. Crie um **ID do cliente OAuth** do tipo **Aplicativo da Web**.
3. Adicione exatamente esta URI de redirecionamento autorizado, substituindo o
   domínio pela sua `APP_BASE_URL`:

   ```text
   https://backup.seudominio.com/api/google/callback
   ```

   Em desenvolvimento, use `http://localhost/api/google/callback` (ou inclua a
   porta presente em `APP_BASE_URL`).
4. Copie o Client ID e o Client Secret para o `.env`:

   ```env
   APP_BASE_URL=https://backup.seudominio.com
   GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=seu-client-secret
   ```

## 3. Conectar uma conta

Depois de confirmar o cadastro e entrar no sistema, clique em **Conectar Google
Drive**. O consentimento solicita acesso offline, e a autorização fica
criptografada no banco da aplicação. O sistema cria ou reutiliza a pasta
**Backup Simples** automaticamente.

Se a autorização expirar ou for revogada, o histórico registrará o erro e o
usuário poderá reconectar pelo painel. Projetos OAuth externos em modo de teste
podem emitir refresh tokens com validade limitada; para uso contínuo, publique
o aplicativo conforme os requisitos do Google.

## Referências oficiais

- [OAuth 2.0 para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Escopos da API do Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Pastas no Google Drive](https://developers.google.com/workspace/drive/api/guides/folder)
