name: redraw hero

on:
  schedule:
    - cron: "17 16 * * *" # daily, 16:17 UTC (00:17 in the Philippines)
  workflow_dispatch: {}
  push:
    paths: ["scripts/generate-hero.mjs"]

permissions:
  contents: write

jobs:
  redraw:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Generate hero.svg
        run: node scripts/generate-hero.mjs
        env:
          GH_TOKEN: ${{ secrets.PROFILE_TOKEN || secrets.GITHUB_TOKEN }}
          LOGIN: ${{ github.repository_owner }}
      - name: Commit if changed
        run: |
          git config user.name "jb.line[bot]"
          git config user.email "actions@users.noreply.github.com"
          git add hero.svg
          if ! git diff --cached --quiet; then
            git commit -m "redraw hero"
            git push
          fi
