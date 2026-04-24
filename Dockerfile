# Use official Node.js image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy all your website files
COPY . .

# Expose port 8080 for web traffic
EXPOSE 8080

# Start the Node.js server
CMD ["npm", "start"]