FROM evoapicloud/evolution-api:v2.3.7
WORKDIR /evolution

# WhatsApp passou a enviar companion_reg_refresh no pareamento.
# A Baileys publicada ignora isso e o celular recusa o QR.
# O conserto está neste branch até entrar na imagem oficial.
RUN apk add --no-cache git \
 && npm install --no-audit --no-fund baileys@github:doryani-ai/Baileys#fix/companion-reg-refresh \
 && apk del git
