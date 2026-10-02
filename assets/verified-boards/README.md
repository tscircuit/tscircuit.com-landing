# Physically verified boards

The gallery contains **eight distinct working builds** and **four supporting test
details**. The 12 tiles are not presented as 12 different designs. All images are
photographs or screenshots from @seveibar’s public X posts, not renders. Assets
are bundled locally and lazy-loaded; there are no X embeds or CDN dependencies.

| Asset | Kind | Test source | Demonstrated result |
| --- | --- | --- | --- |
| `f1c100s-linux.jpg` | build | https://x.com/seveibar/status/2105089653795873274 | Linux running. SSH over USB. |
| `nrf52810-bluetooth.jpg` | build | https://x.com/seveibar/status/2089862423205597334 | Advertising and detected on a phone. |
| `volume-macropad.jpg` | build | https://x.com/seveibar/status/2052088203562369138 | Keyboard input and volume controls. |
| `usb-motor-driver.jpg` | build | https://x.com/seveibar/status/2102913477157560510 | Stepper motor running on the bench. |
| `lipo-voltage-meter.jpg` | build | https://x.com/seveibar/status/2052088203562369138 | Battery-voltage measurement verified. |
| `led-accelerometer.jpg` | build | https://x.com/seveibar/status/1937945069367288314 | LEDs responding to movement at 20 Hz. |
| `rp2040-stepper-controller.jpg` | build | https://x.com/seveibar/status/2097093559069610078 | USB-powered motor control tested. |
| `first-react-circuit.jpg` | build | https://x.com/seveibar/status/1785149340253839382 | Manufactured and tested in April 2024. |
| `linux-ssh-session.jpg` | detail | https://x.com/seveibar/status/2105089653795873274 | Live Linux shell over USB. |
| `bluetooth-phone-test.jpg` | detail | https://x.com/seveibar/status/2089862423205597334 | nRF52810 Tracker detected by a BLE scanner. |
| `macropad-usb-test.jpg` | detail | https://x.com/seveibar/status/2052088203562369138 | A closer look at the assembled input board. |
| `rp2040-motor-test.jpg` | detail | https://x.com/seveibar/status/2097093559069610078 | The controller connected during its test. |

## Bring-up and identity notes

- The F1C100S build needed a RAM-voltage patch.
- The nRF52810 build needed a crystal-orientation correction.
- The earlier RP2040 stepper-controller build needed a small wire patch. Its
  close-up photograph comes from the arrival post at
  https://x.com/seveibar/status/2094904502709346532; its working test is linked
  in the gallery. This larger board is distinct from the later compact NEMA17 build.
- The macropad and LiPo meter share the May 6 unboxing post, which says the boards
  worked. Device functions are identified in
  https://x.com/seveibar/status/2052503590468714604, and first-order operation is
  confirmed in https://x.com/seveibar/status/2052439697746723101.
- The accelerometer test shows LEDs responding to movement. The 20 Hz refresh rate
  is explained in https://x.com/seveibar/status/1938095569484083364.
- The first React circuit’s photograph comes from the arrival post at
  https://x.com/seveibar/status/1785128472714817741. The gallery links to its
  successful test at https://x.com/seveibar/status/1785149340253839382.
- Motor and accelerometer demonstration stills are the original video poster frames.

## Original media

| Asset | Media URL |
| --- | --- |
| `f1c100s-linux.jpg` | https://pbs.twimg.com/media/HTbHS2lbsAAQPFJ?format=jpg&name=900x900 |
| `nrf52810-bluetooth.jpg` | https://pbs.twimg.com/media/HQChZ-Ya0AA9_Ih?format=jpg&name=900x900 |
| `volume-macropad.jpg` | https://pbs.twimg.com/media/HHp7V_ebwAAGsg2?format=jpg&name=900x900 |
| `usb-motor-driver.jpg` | https://pbs.twimg.com/amplify_video_thumb/2102913375860858880/img/dfKnfcELqVeOHKgd.jpg |
| `lipo-voltage-meter.jpg` | https://pbs.twimg.com/media/HHp7V_ebgAA-OPS?format=jpg&name=900x900 |
| `led-accelerometer.jpg` | https://pbs.twimg.com/amplify_video_thumb/1937945009657155587/img/GUcbEFhbtQyEAaOX.jpg |
| `rp2040-stepper-controller.jpg` | https://pbs.twimg.com/media/HRKYixRboAAHsMa?format=jpg&name=medium |
| `first-react-circuit.jpg` | https://pbs.twimg.com/media/GMYM4qLagAADAB5?format=jpg&name=medium |
| `linux-ssh-session.jpg` | https://pbs.twimg.com/media/HTbHimGbkAEjiPF?format=jpg&name=large |
| `bluetooth-phone-test.jpg` | https://pbs.twimg.com/media/HQCuP4fb0AApo8I?format=jpg&name=900x900 |
| `macropad-usb-test.jpg` | https://pbs.twimg.com/media/HHp7V_baoAEbEc_?format=jpg&name=900x900 |
| `rp2040-motor-test.jpg` | https://pbs.twimg.com/amplify_video_thumb/2097093174674288640/img/YNlVU4ms2lzDeCGk.jpg |

The section describes demonstrated builds, not a certification or a guarantee
that every design created with tscircuit has been physically tested.
