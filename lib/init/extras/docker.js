const { projectNameFrom } = require('../shared');

function dockerfile({ isTs }) {
  if (isTs) {
    return `# Build stage: compile TypeScript
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: production dependencies and compiled code only
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
`;
  }
  return `FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3000
CMD ["node", "src/server.js"]
`;
}

function compose({ cwd, database }) {
  const name = projectNameFrom(cwd).replace(/[^a-z0-9_]/g, '_');
  const app = [
    'services:',
    '  app:',
    '    build: .',
    '    ports:',
    '      - "3000:3000"',
    '    env_file: .env',
  ];
  if (database === 'MongoDB') {
    return `${app.join('\n')}
    environment:
      CONNECTION_URL: mongodb://mongo:27017/${name}
    depends_on:
      - mongo

  mongo:
    image: mongo:8
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
`;
  }
  if (database === 'MySQL') {
    return `${app.join('\n')}
    environment:
      DB_HOST: mysql
      DB_USER: root
      DB_PASSWORD: change-me
      DB_NAME: ${name}
    depends_on:
      - mysql

  mysql:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: change-me
      MYSQL_DATABASE: ${name}
    volumes:
      - mysql-data:/var/lib/mysql

volumes:
  mysql-data:
`;
  }
  return `${app.join('\n')}\n`;
}

module.exports = {
  key: 'docker',
  label: 'Docker',
  files: (o) => [
    { path: 'Dockerfile', content: dockerfile(o) },
    { path: '.dockerignore', content: 'node_modules\ndist\ncoverage\n.env\n.git\n' },
    { path: 'docker-compose.yml', content: compose(o) },
  ],
};
