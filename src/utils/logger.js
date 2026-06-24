const chalk = require('chalk');

const logger = {
  info: (msg) => console.log(chalk.blue('[INFO]') + ` ${msg}`),
  success: (msg) => console.log(chalk.green('[OK]') + ` ${msg}`),
  warn: (msg) => console.log(chalk.yellow('[WARN]') + ` ${msg}`),
  error: (msg) => console.log(chalk.red('[ERROR]') + ` ${msg}`),
  step: (step, total, msg) => console.log(chalk.cyan(`[${step}/${total}]`) + ` ${msg}`),
  divider: () => console.log(chalk.gray('─'.repeat(50))),
  title: (msg) => {
    console.log('');
    console.log(chalk.bold.cyan(`✦ ${msg}`));
    console.log(chalk.gray('─'.repeat(50)));
  },
};

module.exports = logger;
