# Docker dotfile

```sh
alias d='docker'
alias dc='docker compose'
alias dexec='docker compose exec'

function ddownall() {
  if [ -n "$1" ]; then
    docker compose --profile $1 down --rmi all --volumes --remove-orphans
  else
    docker compose down --rmi all --volumes --remove-orphans
  fi
}
```
