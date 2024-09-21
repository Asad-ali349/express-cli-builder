# Express CLI

**A command-line tool for generating Express application components**

## Description

Express CLI is a command-line tool designed to simplify the development process of Express.js applications. It provides an easy way to generate essential components such as models, routes, controllers, middlewares, and resources with boilerplate templates, streamlining project setup and organization.

## Features

- **Generate Models:** Quickly create Mongoose models with predefined schema templates.
- **Create Routes:** Easily set up route files linked to their corresponding controllers.
- **Build Controllers:** Generate controller files to manage application logic and data interactions.
- **Set Up Middlewares:** Create reusable middleware functions for enhanced application functionality.
- **Resource Creation:** Create a full set of model, route, and controller files for rapid development.

## Benefits

- **Consistent Structure:** Ensures a standardized file structure for better organization and maintainability.
- **Time-Saving:** Reduces repetitive boilerplate code, allowing developers to focus on building features.
- **Flexibility:** Customize templates to fit project needs, enhancing code reusability.

## Installation

To install Express CLI globally, run the following command:

```bash

npm install -g express-cli-builder

```
## Usage

Once installed, you can use the command line to generate different components for your Express.js app.

## Create a Model

To generate a **model**, use the following command:
``` bash

express create:model <model-name>

```

This command will create a model in the models folder. If the folder doesn’t exist, it will be created automatically.

## Create a Controller
To generate a **controller**, use the following command:

``` bash
express create:controller <controller-name>
```

This will create a controller in the controllers folder.

## Create a Route
To generate a **route**, use the following command:

``` bash
express create:route <route-name>
```

This will create a route in the routes folder.

## Create a Middleware
To generate a **middleware**, use the following command:

``` bash
express create:middleware <middleware-name>
```

This will create a middleware in the middlewares folder.

## Create a Resource
The resource command will create a **model, route, and controller** with boilerplate code:

``` bash
express create:resource <resource-name>
```

This will create:

The model in the **models** folder.
The controller in the **controllers** folder.
The route in the **routes** folder.
