WORKDIR /app

COPY package*.json ./
COPY .puppeteerrc.cjs ./
COPY scripts ./scripts

RUN npm ci --omit=dev

COPY . .