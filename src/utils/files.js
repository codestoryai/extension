const fs = require('fs/promises');
const path = require('path');
const { glob } = require('glob');

const copyDirectoryDefaultOptions = {
  overwrite: true,
  ignore: [],
};

function defineDefaultOptions(providedOptions, defaultOptions) {
  for (const key in defaultOptions) {
    if (providedOptions[key] === undefined) {
      providedOptions[key] = defaultOptions[key];
    }
  }
}

/**
 * Recursively copies all files from a source directory to a target directory,
 * excluding any files starting with "standalone.".
 *
 * @param {string} sourceDir - The source directory path.
 * @param {string} targetDir - The target directory path.
 * @param {object} [options]
 * @param {boolean} [options.overwrite=true] - Whether to overwrite existing files in the target.
 *
 * @throws Will throw an error if the source directory does not exist or copying fails.
 *
 * @example
 * await copyDirectory('src', 'dest', { overwrite: false });
 */
async function copyDirectory(sourceDir, targetDir, options = {}) {
  defineDefaultOptions(options, copyDirectoryDefaultOptions);

  // Verify that sourceDir exists and is a directory
  let sourceStats;
  try {
    sourceStats = await fs.lstat(sourceDir);
  } catch (err) {
    throw new Error(
      `Source directory "${sourceDir}" does not exist or is not accessible: ${err.message}`
    );
  }

  if (!sourceStats.isDirectory()) {
    throw new Error(`Source path "${sourceDir}" is not a directory.`);
  }

  // Ensure the target directory exists
  await fs.mkdir(targetDir, { recursive: true });

  // Use glob to get all files and directories except those starting with 'standalone.'

  const items = await glob('**/*', {
    cwd: sourceDir,
    dot: true,
    nodir: false,
    ignore: options.ignore,
  });

  for (const item of items) {
    const sourcePath = path.join(sourceDir, item);
    const targetPath = path.join(targetDir, item);

    const stats = await fs.lstat(sourcePath);

    if (stats.isSymbolicLink()) {
      // Handle symlinks
      const linkTarget = await fs.readlink(sourcePath);
      await safelyCreateSymlink(linkTarget, targetPath, options.overwrite);
    } else if (stats.isDirectory()) {
      // Recreate the directory structure
      await fs.mkdir(targetPath, { recursive: true });
    } else if (stats.isFile()) {
      // Copy files
      await copyFile(sourcePath, targetPath, options.overwrite);
    } else {
      // Skip special files (e.g., sockets, devices)
      // console.warn(`Skipping special file: ${sourcePath}`);
    }
  }
}

/**
 * Copies a single file from source to target, respecting the overwrite option.
 *
 * @param {string} source - The source file path
 * @param {string} target - The target file path
 * @param {boolean} overwrite - Whether to overwrite if the target exists
 */
async function copyFile(source, target, overwrite) {
  let targetExists = false;

  try {
    const targetStats = await fs.lstat(target);
    if (targetStats.isDirectory()) {
      throw new Error(
        `Cannot copy file "${source}" to "${target}" because the target is a directory.`
      );
    }
    targetExists = true;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Unexpected error
      throw err;
    }
  }

  if (targetExists && !overwrite) {
    // If target exists and we don't want to overwrite, skip
    return;
  }

  // Ensure the target directory exists
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

/**
 * Creates or overwrites a symlink at linkPath pointing to linkTarget.
 *
 * @param {string} linkTarget - The target of the symlink
 * @param {string} linkPath - The path where the symlink should be created
 * @param {boolean} overwrite - Whether to overwrite an existing link/file
 */
async function safelyCreateSymlink(linkTarget, linkPath, overwrite) {
  let targetExists = false;
  try {
    await fs.lstat(linkPath);
    targetExists = true;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  if (targetExists && !overwrite) {
    // Do not overwrite if not allowed
    return;
  }

  // If something exists there, remove it
  if (targetExists) {
    await fs.rm(linkPath, { recursive: true, force: true });
  }

  await fs.mkdir(path.dirname(linkPath), { recursive: true });
  await fs.symlink(linkTarget, linkPath);
}

module.exports = {
  copyDirectory,
  copyDirectoryDefaultOptions,
};

// Example usage:
// (async () => {
//   try {
//     await copyDirectory('./my-source', './my-dest', { overwrite: false });
//     console.log('Copy completed successfully!');
//   } catch (err) {
//     console.error('Error during copy:', err);
//   }
// })();
