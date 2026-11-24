# NFS-e Worker (Sefin Nacional)

Emite a DPS assinada com o certificado A1 direto na API da Sefin Nacional (`POST /nfse`) e gera a DANFSe a partir do XML autorizado. A série é de 1 a 49999 (`NFSE_SERIE_DPS=1`). A faixa 70000 fica só no site.

Roda **neste PC** (o certificado fica aqui). Não sobe para a Vercel.

## Setup

```bash
cd google-sheets/nfse-worker
npm install
npm run install:browsers
```

O `.env` desta pasta aponta o certificado:

```env
NFSE_CERT_PATH=certs/gps-bahia.pfx
NFSE_CERT_PASSWORD=senha-do-arquivo
NFSE_WORKER_SECRET=troque-este-segredo
NFSE_WORKER_PORT=8791
# NFSE_HEADED=1
# NFSE_DRY_RUN=1
```

No `google-sheets/.env` (API):

```env
NFSE_WORKER_URL=http://127.0.0.1:8791
NFSE_WORKER_SECRET=troque-este-segredo
```

Suba o worker:

```bash
npm start
```

`NFSE_DRY_RUN=1` monta e confere a DPS e não envia nada à Sefin.

## Certificado A1

O login é em `https://certificado.nfse.gov.br`. O arquivo usado é o e-CNPJ A1 da GPS BAHIA (`10.348.519/0001-19`), exportado do certificado instalado no Windows para `certs/gps-bahia.pfx`.

O git ignora `*.pfx` e `.env`. Não envie o arquivo nem a senha para a Vercel.

## O que a DPS leva

1. Prestador GPS BAHIA, Simples Nacional, tomador pelo CPF/CNPJ e município do CEP.
2. Serviço em Camaçari (guincho `14.14.01`, estadias `11.04.01`, apreensão e chaveiro `17.22.01`), descrição e dados bancários em uma linha.
3. Valor do serviço, ISS sem retenção e alíquota do Simples (`NFSE_ALIQUOTA_SN`, 16%). Alíquota de ISS só entra se a nota for com ISS retido.
4. A DANFSe de uma página sai do XML devolvido pela Sefin. O botão Baixar PDF do painel usa esse arquivo.

## Health

`GET http://127.0.0.1:8791/health`
