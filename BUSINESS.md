# Waitlist Kit: business one-pager

## Buyer

Indie makers, small startups and agencies preparing a launch (app, course, product drop, event) who want a
signup page that spreads by itself. Local angle: Moroccan/francophone founders and agencies building launch
pages for clients.

## Problem

A plain e-mail box collects addresses and stops. Referral waitlists (Robinhood/Prefinery style) grow faster
but the hosted tools are priced in USD per month and are heavy. Makers want a script tag they own.

## Pricing

- Free: 1 list, 200 signups.
- Maker: 79 MAD/month (about 8 USD): 3 lists, 5,000 signups, CSV, custom title/button.
- Agency: 299 MAD/month (about 30 USD): unlimited lists for client launches, white-label.
- One-off launch page build with the widget: 1,500 to 3,000 MAD.

## First 5 customers

1. Build launch pages for 2 or 3 local founders/agencies with it (paid setup), and keep them on the monthly plan for hosting.
2. Post a "referral waitlist in one script tag" demo on Product Hunt Upcoming alternatives, r/SideProject, Indie Hackers, plus a short LinkedIn post in French.
3. Offer it free to 5 Moroccan university/startup event organisers and bootcamps (registration lists with referral boosts) in exchange for a public testimonial.

## Accounts needed to go live

VPS or Fly.io/Railway with a disk, domain, Resend (welcome/confirmation mail, once built), Stripe or a
Moroccan gateway for paid plans. Multi-user SaaS would need Auth.js and Postgres.

## Honest limits

- Single admin today: not self-serve, no billing.
- No e-mail verification or welcome e-mail, so list quality is unverified and referral codes can be looked up by e-mail (see README).
- IP-based self-referral check is weak against determined gamers; rank is trivially inflatable with many addresses and IPs. Do not use it for prizes without double opt-in.
- Crowded space (Prefinery, Viral Loops, Waitlist.email, Kickoff Labs), so the pitch is price, ownership and local support.
- Widget only tested in jsdom, not across real browsers/themes.
