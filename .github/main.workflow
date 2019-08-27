workflow "CI" {
  on = "push"
  resolves = ["Test"]
}

action "Install" {
  uses = "docker://node"
  runs = "yarn"
  args = "install"
}

action "Lint" {
  uses = "docker://node"
  needs = ["Install"]
  runs = "yarn"
  args = "lint"
}

action "Test" {
  uses = "docker://node"
  needs = ["Lint"]
  runs = "yarn"
  args = "test"
}
