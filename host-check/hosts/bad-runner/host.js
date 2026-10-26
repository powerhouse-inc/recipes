// A runner module the project does not install: a load issue, found before
// any other stage can run.
export default {
  name: "bad-runner",
  runner: { module: "@powerhousedao/not-installed/runners/switchboard" },
};
