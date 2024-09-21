const { prompt } = require('enquirer');

prompt({
    type: 'input',
    name: 'name',
    message: 'What is your name?'
})
.then(answers => {
    console.log(`Hello, ${answers.name}!`);
})
.catch(console.error);