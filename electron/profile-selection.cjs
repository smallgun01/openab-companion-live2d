/** Return the optional development profile selected on Electron's command line. */
function getRequestedProfileId(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const inline = /^--profile=(.+)$/.exec(argument);
    const candidate = inline?.[1] ?? (argument === '--profile' ? argv[index + 1] : null);
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

module.exports = { getRequestedProfileId };
