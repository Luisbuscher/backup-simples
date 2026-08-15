# Configuração do Google Drive

O backend usa OAuth 2.0 com acesso offline. Não existe uma tela de autorização
na aplicação: o refresh token é gerado uma vez e informado no `.env`.

## 1. Criar o projeto e ativar a API

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um projeto ou selecione um existente.
3. Abra **APIs e serviços → Biblioteca**.
4. Procure por **Google Drive API** e clique em **Ativar**.

## 2. Configurar a tela de consentimento

1. Abra **APIs e serviços → Tela de consentimento OAuth**.
2. Escolha **Interno**, se a conta pertence a um Google Workspace e somente
   pessoas da organização usarão o projeto, ou **Externo** para uma conta
   comum.
3. Informe o nome da aplicação e os e-mails solicitados.
4. Adicione sua própria conta em **Usuários de teste**, se o projeto estiver em
   modo de teste.
5. Adicione o escopo:

   ```text
   https://www.googleapis.com/auth/drive
   ```

Esse escopo permite enviar arquivos para IDs de pastas definidos manualmente.
Ele concede acesso amplo ao Drive da conta autorizada. Use uma conta dedicada
quando possível.

> Em projetos do tipo Externo com status **Testing**, autorizações que usam
> escopos do Drive e seus refresh tokens expiram em 7 dias. Para uso contínuo,
> publique o aplicativo como **In production** e cumpra os requisitos mostrados
> pelo Google, ou use um projeto Interno elegível.

Faça essa publicação **antes** de gerar o token usado em produção. Publicar o
aplicativo não reativa um token que já expirou: nesse caso, gere outro refresh
token depois da mudança de status.

## 3. Criar as credenciais OAuth

1. Abra **APIs e serviços → Credenciais**.
2. Clique em **Criar credenciais → ID do cliente OAuth**.
3. Escolha **Aplicativo da Web**.
4. Em URIs de redirecionamento autorizados, adicione:

   ```text
   https://developers.google.com/oauthplayground
   ```

5. Salve e copie o **Client ID** e o **Client Secret**.

## 4. Obter o refresh token

1. Abra o [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
2. Clique na engrenagem, marque **Use your own OAuth credentials** e informe o
   Client ID e o Client Secret.
3. Em **Step 1**, cole o escopo
   `https://www.googleapis.com/auth/drive` e clique em **Authorize APIs**.
4. Entre com a conta que possui as pastas dos backups e conceda o acesso.
5. Em **Step 2**, clique em **Exchange authorization code for tokens**.
6. Copie o valor de **Refresh token**.

Se nenhum refresh token aparecer, revogue a autorização anterior da aplicação
na sua Conta Google e repita o fluxo de consentimento.

## 5. Obter o ID da pasta

Abra a pasta desejada no Google Drive. Em uma URL como:

```text
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp
```

o ID é:

```text
1AbCdEfGhIjKlMnOp
```

Use a pasta geral em `GOOGLE_DRIVE_ROOT_FOLDER_ID`. No cadastro de cada banco,
você pode informar outro ID; se o campo ficar vazio, a pasta geral será usada.

## 6. Preencher o `.env`

Edite o arquivo `.env` na raiz do projeto:

```env
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REFRESH_TOKEN=seu-refresh-token
GOOGLE_DRIVE_ROOT_FOLDER_ID=id-da-pasta-geral
```

Não versione esse arquivo e não compartilhe o client secret ou o refresh token.

## 7. Verificar a autorização

O comando abaixo testa somente a renovação da autorização; ele não cria nem
envia arquivos:

```bash
cd backend
npm run build
npm run google:check
```

Com Docker Compose, use:

```bash
docker compose run --rm backend npm run google:check
```

Se aparecer a mensagem de que a autorização expirou ou foi revogada:

1. No Google Auth Platform, abra **Público-alvo (Audience)**.
2. Se o tipo for **Externo** e o status for **Teste (Testing)**, clique em
   **Publicar app (Publish app)** para mudar para **Em produção**. Para uma
   organização Google Workspace elegível, também é possível usar o tipo
   **Interno**.
3. Repita o procedimento da seção 4 para gerar um novo refresh token.
4. Substitua `GOOGLE_REFRESH_TOKEN` no `.env` do ambiente de produção.
5. Recrie o backend para que ele carregue a nova variável:

   ```bash
   docker compose up -d --build --force-recreate backend
   ```

6. Execute novamente `npm run google:check` e refaça manualmente os backups
   perdidos. Agendamentos passados não são reprocessados automaticamente.

## Referências oficiais

- [Ativar APIs e configurar OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Escopos da API do Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Upload para uma pasta](https://developers.google.com/workspace/drive/api/guides/folder)
- [Expiração de refresh tokens](https://developers.google.com/identity/protocols/oauth2)
