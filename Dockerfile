# ==========================================
# STAGE 1: BUILDER
# ==========================================

FROM node:20-slim AS builder

WORKDIR /app

# 1. Install root dependencies
COPY package*.json ./
RUN npm install

# 2. install client dependencies
COPY client/package*.json ./client/
RUN cd client && npm install

# 3. Copy all source code
COPY . .

# 4. Run the master build script
RUN npm run build

# ==========================================
# STAGE 2: RUNNER (Production Image)
# ==========================================
FROM node:20-slim AS runner

WORKDIR /app

# 1. Copy only the compiled files and production modules from the Builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 2. Create the data directory for SQLite
RUN mkdir -p /app/data

# 3. Expose the Express port
EXPOSE 3001

# 4. Start the engine using the compiled JS
CMD ["npm", "start"]