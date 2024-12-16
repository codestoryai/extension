const fs = require('fs');

export function checkIsValidFullPath(pathToCheck: string) {
  try {
    console.log('path to check');
    fs.accessSync(pathToCheck);
    return true;
  } catch (err) {
    return false;
  }
}

export function checkIsValidURL(string: string) {
  try {
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}