## Express CLI
***A command-line tool for generating Express application components***
## Description
Express CLI is a powerful command-line tool that streamlines the development of Express.js applications. It provides a straightforward way to generate essential components like models, routes, controllers, middlewares, and resources, complete with boilerplate templates. With the express init command, users can easily set up a basic Express app template with customizable options for TypeScript or JavaScript, and select their preferred database (MySQL, MongoDB, or skip database setup entirely).

When a database is selected, the CLI automatically configures the database connection and generates a .env file with the required environment variables, such as the connection URL for MongoDB, or the database name, user, and password for MySQL. Even if users opt to skip database configuration, the CLI ensures the project remains clean and organized. This allows developers to focus more on building features and less on repetitive tasks, while still offering flexibility for future project scaling.

To make navigation easier, the express --help command provides users with a list of all available commands, each with a short description of its functionality. This makes it simple to explore and use the CLI’s features, allowing developers to focus more on building features and reducing repetitive tasks.

## Installation

 
> **Note:**  To access the express-cli-builder commands from anywhere on your system, it is recommended to install the package globally using the following command:
``` bash
npm install -g express-cli-builder
```
> This will allow you to use the express command in any directory without needing to install it locally for every project.


## Usage
Once installed, you can use the command line to generate different components for your Express.js app.

### Initialize a Basic App Template
To initialize a basic Express app template, use the following command:

```bash
express init
```

***This command will prompt you with the following questions:***

1. Would you like to use TypeScript or JavaScript?
2. Which database would you like to use: MySQL or MongoDB?
3. Do you want to use a src folder?

Based on your answers, the appropriate packages (including cors, dotenv, and body-parser) will be installed, along with TypeScript types if you choose TypeScript.

## List of All Commands
To view all available commands, use the following command:

```bash
express --help
```

> **Tip:** Executing this command will display a list of all the commands along with their descriptions.

## Create a Model
To generate a model, use the following command:

```bash
express create:model <model-name>
```
This command will create a model in the models folder. If the folder doesn’t exist, it will be created automatically.


## Create a Controller
To generate a controller, use the following command:

```bash
express create:controller <controller-name>
```
This will create a controller in the controllers folder.

## Create a Route
To generate a route, use the following command:


```bash
express create:route <route-name>
```
This will create a route in the routes folder.

## Create a Middleware
To generate a middleware, use the following command:

```bash
express create:middleware <middleware-name>
```
This will create a middleware in the middlewares folder.

## Create a Resource
The resource command will create a model, route, and controller with boilerplate code:

```bash
express create:resource <resource-name>
```

This will create:

- The model in the models folder.
- The controller in the controllers folder.
- The route in the routes folder.


## Features
- Initialize Basic App Template: Use the express init command to set up a basic Express app with a customizable folder structure.
- Generate Models: Quickly create Mongoose models with predefined schema templates.
- Create Routes: Easily set up route files linked to their corresponding controllers.
- Build Controllers: Generate controller files to manage application logic and data interactions.
- Set Up Middlewares: Create reusable middleware functions for enhanced application functionality.
- Resource Creation: Create a full set of model, route, and controller files for rapid development.
- Database Configuration: Automatically configure database connections and generate a .env file with necessary environment variables for MongoDB and MySQL, or skip database setup if desired.
- Help Command: Use the express --help command to view all available commands with brief descriptions.
## Benefits
- Consistent Structure: Ensures a standardized file structure for better organization and maintainability.
- Time-Saving: Reduces repetitive boilerplate code, allowing developers to focus on building features.
- Flexibility: Customize templates to fit project needs, enhancing code reusability.
- Streamlined Setup: Simplifies the initial setup process with automated configurations and clear command documentation, making it easier for developers to start new projects.