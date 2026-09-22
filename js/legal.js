/**
 * The footer documents: licence, imprint, privacy, and the quick start. Pure.
 *
 * Every Detronics app carries the same three, so a visitor who wants to know
 * what they are allowed to do with the tool, what it does with their data, and
 * how to begin, never has to ask. Content only — `js/ui/modals.js` renders it.
 *
 * Swap `LICENCE` below to change what the app is released under. It is the one
 * place the name, the summary and the file all agree, so they cannot drift.
 */

export const CONTACT = {
  name: 'Detronics',
  email: 'shop.detronics@gmail.com',
  site: 'https://www.detronics.co.za/',
};

/**
 * The licence this app is released under.
 *
 * MIT with the Commons Clause. MIT gives everyone everything — use it for
 * anything at all, commercial work included, modify it, pass it on — and the
 * Commons Clause removes exactly one right: selling the software itself, or
 * charging for a service whose value is substantially the software.
 *
 * That is the distinction these tools want, and it is a narrower one than
 * "noncommercial". A workshop designing parts it sells is using the tool
 * commercially and is entirely welcome. What is not allowed is packaging the
 * tool up and selling *it*.
 */
export const LICENCE = {
  id: 'MIT WITH Commons-Clause',
  name: 'MIT License with the Commons Clause',
  url: 'https://commonsclause.com/',
  holder: 'Detronics',
  year: '2026',
};

export const LICENCE_DOC = {
  title: 'Licence & terms',
  sections: [
    {
      heading: 'Licence',
      body: `This tool is released under the ${LICENCE.name}. Use it for anything you like — including commercial work — copy it, change it and pass it on. The one thing it does not allow is selling the tool itself: you may not charge for it, host it as a paid service, or build it into a product whose value is substantially this software. The full text is in the LICENSE file in the repository.`,
    },
    {
      heading: 'Using it for paid work is fine',
      body: 'Designing gears you sell, cutting parts for a customer, putting the exported drawings into a job you invoice for — all fine, and none of it needs permission. The gears, the drawings and the DXFs are yours. The restriction is on selling this tool, not on what you make with it.',
    },
    {
      heading: 'No warranty',
      body: 'The software is provided "as is", without warranty of any kind. Everything here is a design aid, not engineering advice.',
    },
    {
      heading: 'Check your work',
      body: 'Gear geometry is unforgiving and this tool models an ideal one. No backlash allowance is applied, the root fillet is a true tangent arc rather than the trochoid a hob actually cuts, and the spline dimensions are indicative. Check every dimension against the standard and the machine you are cutting on before you commit metal, and never rely on a figure from here alone where a failure would matter.',
    },
    {
      heading: 'Standards',
      body: 'The basic rack follows ISO 53 and preferred modules follow ISO 54. Parallel keys follow DIN 6885-1 / ISO 773 and straight-sided splines the DIN 5463 medium series. Where a supplier or a drawing departs from these, they win.',
    },
  ],
};

export const PRIVACY_DOC = {
  title: 'Imprint & privacy',
  sections: [
    {
      heading: 'What this page collects',
      body: 'Nothing. There is no analytics, no tracking, no cookies and no account. Every calculation runs in your browser, and nothing you enter is ever transmitted.',
    },
    {
      heading: 'What is stored on your device',
      body: "Your current bench and settings are kept in this browser's localStorage so the page opens where you left it. That data never leaves your device, is not readable by anyone else, and is cleared when you clear your browser's site data. Saving a project simply downloads a JSON file to your own computer.",
    },
    {
      heading: 'Shareable links',
      body: 'A share link encodes the whole design into the part of the URL after the #, which browsers never send to a server. Whoever you send the link to can see what is in it, so treat it like any other message.',
    },
    {
      heading: 'Hosting',
      body: "This is a static site: plain files, with no application server and no database behind it. The host that serves those files keeps its own ordinary web server logs, which typically include your IP address and the time of your request. That is outside this page's control, and it is the only record your visit creates.",
    },
    {
      heading: 'Third parties',
      body: 'None. No fonts, scripts, stylesheets or images are loaded from anywhere else, and the page makes no network request of any kind once it has loaded.',
    },
    {
      heading: 'Contact',
      body: `This site is operated by ${CONTACT.name} (${CONTACT.site}). For anything about this tool — a bug, a wrong number, a licence question, or a request to use it commercially — write to ${CONTACT.email}.`,
    },
  ],
};

/**
 * The first thing a stranger should read, and the only onboarding this app
 * needs: what it is, then five things to actually do, in the order they make
 * sense. Each step names the tab and the control, so "start here" is one click
 * rather than a hunt.
 */
export const QUICK_START = {
  title: 'Detronics Gear Bench',
  intro: 'Design and simulate interconnected gear trains and planetary gearsets, and export them as SVG or 1:1 DXF. Everything runs in your browser — nothing you draw is uploaded anywhere.',
  steps: [
    'The app opens on a worked example: one pinion driving one wheel, a 3:1 reduction. Nothing to set up.',
    'Type a speed into the Input tile under the drawing and watch every other shaft follow it.',
    'Under Add, hang another gear on: meshed beside it, inside a ring, on the same shaft, or on a belt. The ratio updates as you go.',
    'Use the Simple / Advanced / Expert switch beside the tabs to show more. Advanced adds positions and centre distances; Expert adds profile shift and the pressure angle.',
    'When it is right, Export gives you an SVG, a PNG, or a 1:1 DXF at real centre distances. Share link puts the whole design in a URL.',
  ],
  footnote: 'Stuck? The "How to use" tab searches every how-to and question in plain words — try "backwards" or "laser cut".',
};

export const FOOTER_DOCS = [LICENCE_DOC, PRIVACY_DOC];
