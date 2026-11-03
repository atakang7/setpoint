# Changelog

All notable changes to Setpoint will be documented here. Releases follow Semantic Versioning and are managed by Release Please.

## [0.2.0](https://github.com/atakang7/setpoint/compare/setpoint-agent-v0.1.0...setpoint-agent-v0.2.0) (2026-11-03)


### Features

* add live read-only run dashboard ([ae56d70](https://github.com/atakang7/setpoint/commit/ae56d70331c62d04f9e064be14ba2180591f7884))
* add live run inspection model ([2d910db](https://github.com/atakang7/setpoint/commit/2d910db98318ce3c27829aff8caed5540dd1351f))
* add standalone ACP evaluator sessions ([782d6aa](https://github.com/atakang7/setpoint/commit/782d6aa2f187bc7df008f63f7cec091419d6da85))
* expose inspect watch and browser ui commands ([7633ee2](https://github.com/atakang7/setpoint/commit/7633ee2dbd012903542d4673c2ee76e823c544e3))
* implement Setpoint v0.1 autopilot ([42024c8](https://github.com/atakang7/setpoint/commit/42024c83aaedf12dcced68140efd6c6dd1ee38b7))
* let visual judges see browser screenshots ([a129bc4](https://github.com/atakang7/setpoint/commit/a129bc4788a3d1f86c27b0a9ac9294fdfeff5d47))
* make standalone agent sessions the default reasoner ([a98cd85](https://github.com/atakang7/setpoint/commit/a98cd85655d46a5eee22563a9f67965e264e15c4))
* send observer screenshots as ACP image prompts ([c29c6d5](https://github.com/atakang7/setpoint/commit/c29c6d543411275f60a71570a6be7f7d1b2bd377))
* use standalone ACP sessions for reasoning roles ([6d306d5](https://github.com/atakang7/setpoint/commit/6d306d58f6f5eb77eed6f9bdc020b7fb7ac2304c))


### Bug Fixes

* **acp:** surface prompt request failures ([fdafdf9](https://github.com/atakang7/setpoint/commit/fdafdf91df07233daf5e67e88fbc513e5120985f))
* **config:** create config files atomically ([f7309ed](https://github.com/atakang7/setpoint/commit/f7309ed2536072fc8e1e4b58a6c281ec82f71f0d))
* **config:** create files without overwriting them ([4c02247](https://github.com/atakang7/setpoint/commit/4c02247eb0dd612c51dbbc8997b4f2c937248261))
* judge/jury runaway sessions and JSON contract violations ([a98736b](https://github.com/atakang7/setpoint/commit/a98736b6d1038ec3005d99d361246864079317d5))
* make doctor agent-session aware ([0641c13](https://github.com/atakang7/setpoint/commit/0641c13cc1f6245640bca74006ab95d7c8976f57))
* make run dashboard build-safe ([7f7a78a](https://github.com/atakang7/setpoint/commit/7f7a78a0a0f8b72d0467656bd666a7ab99c0dee7))
* **openai:** bound evaluator requests to two minutes ([82a86eb](https://github.com/atakang7/setpoint/commit/82a86eb0ea4e255814d17e43ea1aa1216ae699aa))
* resolve validation bugs and add real-traffic test coverage ([884dd89](https://github.com/atakang7/setpoint/commit/884dd892e5ff52b7fe78058e2f668ce0ba9995b4))
* **runtime:** enforce observer cleanup and protect run artifacts ([df1326c](https://github.com/atakang7/setpoint/commit/df1326cc326f14993f1a7da739043a3806c88ac6))


### Reverts

* restore state before production pass ([d0bd210](https://github.com/atakang7/setpoint/commit/d0bd210437d3a2a98b914409d820cecea464683d))
* restore state before production pass ([9827535](https://github.com/atakang7/setpoint/commit/98275357e4c47ce5244f68ee978f5b2f7ccf667f))

## 0.1.0

Initial public implementation of the Setpoint outcome-control loop.
