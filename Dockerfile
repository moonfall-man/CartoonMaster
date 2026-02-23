FROM node:20-alpine

WORKDIR /app

# Copy package files if they exist, otherwise just copy app files
COPY . .

# Expose the port Cloud Run will use
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
