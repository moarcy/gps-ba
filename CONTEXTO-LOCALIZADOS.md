# GPS BA — contexto dos localizados (não começar do zero)

Leia este arquivo no início de um chat novo sobre placas, Locgram, localizadores, assessorias, lotes ou checklist de posição.

## O que é

GPS BA recupera veículos na Bahia. O escritório (Moarcy) fala com **localizadores** na rua e com **assessorias** (escritórios de advocacia dos bancos).

| Nome na rua | Cidade |
|---|---|
| Bira (Jubiraci) e Carlos | Salvador |
| Maciel | Barreiras |

Outros no Locgram (Endrigo, Márcia, Lucas) = outras praças.

## O problema

Temos **muitos** carros que já “bateram” (foram localizados no Locgram), mas **não temos certeza da posição agora**. Volume alto. Localizador não é gente de sistema — não manda lista de 200 placas.

Por isso a ordem de trabalho é:

1. **Confirmar posição** com o localizador (checklist).
2. **Só depois** cobrar status na assessoria, e só dos que tiverem posição **Sim**.

## Regras dos dados

- Fonte ao vivo: Evolution no notebook escuta o Locgram e joga a placa na aba **Localizados** (Pendente).
- Histórico: ZIP `Conversa do WhatsApp com Locgram Atendimento (2).zip` (chat Locgram, 10/03/2026 → 12/09/2026).
- Listas manuais: **Lista Bira** + listas do Maciel (09/09/2026). Placa que não está no ZIP **não some** — entra na aba.
- **1 placa = 1 linha = última data** que bateu. Se localizou de novo, vale a última.
- No mesmo dia, a ordem é a **ronda**: do primeiro horário ao último.
- Na operação, o **dia mais recente fica em cima** (posição mais quente).
- WhatsApp: **todos os carros daquela data**, um dia de cada vez. No dia, ordem da ronda.
- Se dois carros do mesmo dia bateram em até **45 min**, provavelmente estão perto.

## Status que o Moarcy marca (coluna Posição?)

| Marca | Significa |
|---|---|
| Pendente | ainda não perguntou / sem resposta |
| Sim | o localizador AINDA tem a posição |
| Não | não tem mais |

Marcar na aba **Localizados**. Sync **não pode apagar** Sim/Não já marcado.

## Abas na planilha `CONTROLE DILIGENCIAS - GERAL`

- **Localizados** — aba de operação: local + data + Posição? (é nessa que se marca).
- **Lotes Localizador** — os mesmos carros fatiados em lotes de 6 (apoio).
- **Localizados Status** — visão completa (assessoria, CRM, apreendidos, etc.).

Planilha: https://docs.google.com/spreadsheets/d/1QBcAEqK9MNbP4DiqN4rhPAm-rUXQlh_I/edit

## Arquivos no repo

- `CONTEXTO-LOCALIZADOS.md` — este arquivo.
- `lotes-localizadores.txt` — texto para copiar no Zap (1 lote por vez).
- `mensagens-assessorias-amanha.txt` — mensagens para assessoria (usar **depois** da posição Sim).
- `google-sheets/lib/localizados-status.js` — cruza ZIP + listas + CRM.
- `google-sheets/lib/localizador-lotes.js` — datas, lotes, checklist.
- `google-sheets/push-localizados-status.js` — sobe as abas.

Na aba **Local** do app: escolhe Bira / Carlos / Maciel, copia o Zap **do dia inteiro**, marca **Sim** ou **Não**. A Evolution **não** fala com o loc — só coleta a batida.

Worker: `whatsapp-locgram/` (notebook, igual o Telegram). Webhook `http://127.0.0.1:8790/webhook`.

- `GET /api/localizados` — lotes e checklist
- `POST /api/localizados` — `{ placa, posicao: "Pendente"|"Sim"|"Não" }`

Regenerar (na pasta `google-sheets`):

```
npm run localizados:status
```

Preserva Posição? e Obs. Precisa do ZIP na raiz do projeto e de `google-sheets/.env`.

## O que não misturar

- Radar Feira / Telegram = outra operação (caminhão, Feira de Santana).
- NFS-e / prêmio / Controle (Planilha1) = apreensão já fechada. Quem já está no pátio **não entra** no checklist de posição.

## Próximos passos naturais num chat novo

1. Conferir o que está **Pendente** na aba Localizados.
2. Mandar o dia inteiro no Zap para Bira, Carlos ou Maciel.
3. Marcar Sim/Não conforme a resposta.
4. Quando houver Sim, montar mensagem só desses para a assessoria.
