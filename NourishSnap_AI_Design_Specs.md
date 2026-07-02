NOURISHSNAP AI — CLEAN, BOTANICAL, MINIMALIST DESIGN TOKENS 

## **Design System & UI/UX Spec** 

## **1. Visual Philosophy & Design Identity** 

The design system of NourishSnap AI moves directly away from standard modern fitness applications that implement loud, clinical, hyper-vibrant primary color matrices. Instead, the interface implements an organic, grounding layout system configured to balance and mitigate meal-tracking friction and anxiety. The primary layout targets zero visual clutter and intuitive, single-thumb interactive pathways. 

## **2. Chromatic Architecture Tokens** 

The application layout leverages the following strictly configured aesthetic palette: 

**==> picture [496 x 98] intentionally omitted <==**

**----- Start of picture text -----**<br>
Canvas Base Deep Bark Botanical Sage Taupe Gray<br>#FDFBF7 #2C221E #4A6B52 #8C827A<br>**----- End of picture text -----**<br>


|**Role**|**Token Hex**|**Implementation Target Mapping**||
|---|---|---|---|
|**Canvas Background**|`#FDFBF7`|Full screen base backdrops, empty views, sheet structure<br>layers.||
|**Typography Headings**|`#2C221E`|Primary numerical callouts, section labels, active entry<br>strings.||
|**Accent Actions**|`#4A6B52`|Shutter action triggers, fulflled target rings, active<br>interactive sliders.||
|**Secondary**<br>**Typographic**|`#8C827A`|Unit descriptions, baseline placeholders, background<br>container borders.||
|**Surface Card Panels**|`#FFFFFF`|Active interactive sheets, modal content frames, text entry<br>felds.||



Page 1 of 4 

## **3. Mobile Interface Block Grid Layout** 

To avoid sudden layout shifts or jumping tracking sheets when system digital keyboards toggle, the responsive layout works on a strict absolute viewport mapping paradigm. 

- **The Core Viewport Frame (Upper 70%):** Displays a zero-margin hardware camera stream context enclosed within rounded border structures. This area features no analytical markers, overlays, or grid guidelines, maintaining clean minimalism. 

- **The Native Pulse Shutter (Bottom Fixed Placement):** Centralized single-button anchor. Features a translucent breathing background circle holding an inner solid Botanical Sage color button. 

- **The Slide-Up Component Panel (Bottom Overlay Sheet):** Transitions dynamically from the bottom edge into view when an image confirmation finishes processing. Displays food item labels via clear inline editable inputs. 

## **4. Custom Interactive CSS Elements** 

The layout tokens map precisely into the following responsive CSS specification definitions: 

Page 2 of 4 

```
/* Core Structural Framework Rules */
body {
  background-color: #FDFBF7;
  color: #2C221E;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  margin: 0;
  padding: 0;
}
/* Master Action Pulse Capture Shutter Component */
.shutter-btn-outer-ring {
  width: 76px;
  height: 76px;
  background-color: rgba(74, 107, 82, 0.15);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.shutter-btn-inner-core {
  width: 60px;
  height: 60px;
  background-color: #4A6B52;
  border-radius: 50%;
  border: 2px solid #FDFBF7;
  transition: transform 0.12s cubic-bezier(0.2, 0, 0, 1);
}
```

```
.shutter-btn-inner-core:active {
  transform: scale(0.90);
}
/* Slide-Up Metric Display Container */
.bottom-sliding-analytics-panel {
  background-color: #FFFFFF;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -8px 32px rgba(44, 34, 30, 0.08);
  padding: 24px;
  position: absolute;
  bottom: 0;
  width: 100%;
  box-sizing: border-box;
}
/* Micro-Macro Indicator Badges */
.macro-metric-badge-pill {
  background-color: #FDFBF7;
  border: 1px solid rgba(140, 130, 122, 0.25);
  border-radius: 12px;
  padding: 10px;
  text-align: center;
}
```

Page 3 of 4 

```
.macro-metric-numeric-bold {
  font-size: 15pt;
  font-weight: 700;
  color: #2C221E;
}
```

```
.macro-metric-label-muted {
  font-size: 8.5pt;
  color: #8C827A;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
/* Shadow Layer Highlight Overlay */
.shadow-oil-prompt-callout-badge {
  background-color: rgba(74, 107, 82, 0.08);
  border: 1px solid #4A6B52;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 9.5pt;
  color: #2C221E;
  margin: 12px 0;
}
```

## **5. Animation Rules & Interactive Flow** 

- **Interactive Drawer Entrance:** Slide transitions switch elements seamlessly from `transform: translateY(100%)` up into active viewport alignment over an explicit duration of **280ms** utilizing an asymmetric easing curve ( `cubic-bezier(0.16, 1, 0.3, 1)` ). 

- **Macro Numeric Recalculation Telemetry:** When weight parameters shift, macro text fields trigger rapid background count transitions across intermediate calculated metrics rather than jumping abruptly, maintaining responsive tactile parity. 

Page 4 of 4 

