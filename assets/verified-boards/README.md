# Physically verified boards

Six distinct physical builds. Photos are bundled locally and lazy-loaded.
Gallery JPEGs are resized to 640px wide and encoded at quality 60. This supports
the largest tablet thumbnails at approximately 2× density, while avoiding the
full-resolution originals in the page download. Vite bundles these assets
without automatically resizing them.

| Asset | Build / source | Photo provenance |
| --- | --- | --- |
| `gameboy.jpg` | https://tscircuit.com/abse/gameboy | User-supplied powered-on photograph, attachment 2. |
| `usb-motor-driver.jpg` | https://x.com/seveibar/status/2102913477157560510 | User-supplied NEMA17 close-up, attachment 4; linked post shows motor operation. |
| `wifi-smart-switch.jpg` | https://tscircuit.com/abse/wifi-smart-switch | User-supplied photograph, attachment 3. |
| `f1c100s-linux.jpg` | https://x.com/seveibar/status/2105089653795873274 | https://pbs.twimg.com/media/HTbHS2lbsAAQPFJ?format=jpg&name=900x900 |
| `nrf52810-bluetooth.jpg` | https://x.com/seveibar/status/2089862423205597334 | https://pbs.twimg.com/media/HQChZ-Ya0AA9_Ih?format=jpg&name=900x900 |
| `msp430-pico.jpg` | https://x.com/seveibar/status/2095192727898214542 | https://pbs.twimg.com/media/HROdLgmaMAASNSC?format=jpg&name=medium |

The Game Boy image shows its RP2040 display running. The MSP430 source identifies
assembled MSP430F5503 boards in a Pico form factor; the caption describes that
build without claiming an additional functional test. Game Boy and Wi-Fi switch
cards link to their community designs. Other cards link to the relevant X logs.

The F1C100S build needed a RAM-voltage patch. The nRF52810 build needed a
crystal-orientation correction. Their source posts document successful operation
after bring-up. The section showcases physical community builds, rather than a
certification or guarantee that every tscircuit design has been tested.
