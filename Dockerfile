# Use the official, lightweight NGINX image
FROM nginx:alpine

# Copy all your website files (HTML, CSS, JS, Images) to the NGINX public folder
COPY . /usr/share/nginx/html

# Expose port 80 for web traffic
EXPOSE 80

# Start the NGINX server
CMD ["nginx", "-g", "daemon off;"]