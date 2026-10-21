# XBRW++ for roasters: a setup guide

> Integration status: the feed parser, catalogue routes, checker and explicit
> Import choices are staged. Subscription offers and safe re-import are separate
> follow-ups. This guide describes the intended completed flow, not a release
> readiness claim.

This guide is for coffee roasters who publish xBloom recipes for their coffees
and want customers to find them in XBRW++. You do not need to be a developer.
If you can edit your website's theme or upload a file, you can do this.

The technical contract is in [roaster-feed.md](roaster-feed.md). This page is
the practical version.

## What your customers get

- **A button on your product page.** "Open in XBRW++" sends your recipe and the
  coffee's details (origin, process, tasting notes, photo) to the app in one
  tap.
- **Subscribe to you.** After that first recipe arrives, the app asks
  "Subscribe to {your name}?". Saying yes adds your range to the app's
  catalogue. Nothing else is added to their library.
- **Your catalogue.** They can browse every coffee you have a recipe for, with
  photos, roast level, tasting notes and bag sizes, and search or filter it.
  Subscribed roasters are reached through **Import → All roasters**, not the
  xBloom catalogue. Under **Manage feeds**, each roaster has **Show in Import**:
  customers can choose up to three shortcuts, shown in selection order.
  Subscribing does not select a shortcut automatically; removing one leaves
  the subscription and saved recipes alone.
- **New coffees and restocks.** When you add a coffee, it shows as NEW in their
  catalogue the next time the app updates. If a coffee is sold out, they can
  ask to be told when it is back, and the app tells them when your list says
  it is on sale again.
- **Buy from you.** Each bag size can have a BUY button that opens your shop in
  their browser. Payment happens on your site. The app never sees it.
- **Bags, rest and peak.** If you say how long a coffee should rest and when it
  peaks, the app shows it ("Rest 14 days, peak day 35, best by day 52").

## What you need

1. **Your recipes on xBloom, shared as links.** In the xBloom app, share each
   recipe and copy the link (it looks like `https://share-h5.xbloom.com/?id=...`).
   One link per coffee is enough. If you have recipes for different doses
   (such as 15 g and 18 g), you can list both.
2. **A name for each coffee.**

That is all that is required. Everything else is optional and has a sensible
default: photos, origin details, tasting notes, roast advice, prices and buy
links. Add them when you can.

You can publish your list in one of two ways:

- **Path A, Shopify:** a theme template that builds the list from your
  products automatically.
- **Path B, any website:** a JSON file you upload anywhere that serves files
  over https.

## Path A: Shopify

You add two things to your theme: a collection template that publishes your
list, and a button on your product pages.

### 1. Store the recipe links on your products

Create product metafields for the share links, for example a single line text
field called `xbloom_18g` (and `xbloom_15g` if you have a second dose). Paste
each product's xBloom share link into it. You can use any names you like: the
template below has one marked block where you map your own field names.

Put the coffees in a collection (for example `coffee`). The list is published
from that collection.

### 2. Add the collection template

In your theme code, add a new template under **Templates** called
`collection.xbrw.liquid` and paste in the code below. Do not assign it to any
collection: it is reached by adding `?view=xbrw` to the collection's address,
so your normal collection page is unchanged.

Your list's address is then:

```
https://your-shop.example/collections/coffee?view=xbrw
```

Edit only the block marked **MAP YOUR FIELDS**. Every name in it that starts
with `MAP_` is a placeholder: replace it with your own metafield namespace and
key. If you do not have a field, leave the line as it is. A missing field is
simply left out of the list.

```liquid
{%- layout none -%}
{%- comment -%}
  Your coffee list for XBRW++, served at /collections/<handle>?view=xbrw.
  Format: https://github.com/hessius/XBRW/blob/develop/docs/roaster-feed.md
{%- endcomment -%}
{%- assign first_coffee = true -%}
{%- assign empty_list = '' | split: ',' -%}
{
  "version": 1,
  "roaster": {
    "name": {{ shop.name | json }},
    "url": {{ shop.url | json }},
    "feed": {{ shop.url | append: collection.url | append: '?view=xbrw' | json }},
    "add_to_cart": {{ shop.url | append: '/cart/add?id={variant_id}&quantity=1' | json }}
  },
  "coffees": [
{%- paginate collection.products by 250 -%}
  {%- for product in collection.products -%}

    {%- comment -%} ===== MAP YOUR FIELDS (edit this block only) ===== {%- endcomment -%}
    {%- comment -%} Required: at least one xBloom share link. {%- endcomment -%}
    {%- assign share_18g = product.metafields.MAP_NAMESPACE.MAP_XBLOOM_18G.value -%}
    {%- assign share_15g = product.metafields.MAP_NAMESPACE.MAP_XBLOOM_15G.value -%}
    {%- comment -%} Optional details. Text fields. {%- endcomment -%}
    {%- assign country    = product.metafields.MAP_NAMESPACE.MAP_COUNTRY.value | default: '' -%}
    {%- assign region     = product.metafields.MAP_NAMESPACE.MAP_REGION.value | default: '' -%}
    {%- assign farm       = product.metafields.MAP_NAMESPACE.MAP_FARM.value | default: '' -%}
    {%- assign farmer     = product.metafields.MAP_NAMESPACE.MAP_FARMER.value | default: '' -%}
    {%- assign elevation  = product.metafields.MAP_NAMESPACE.MAP_ELEVATION_METRES.value | default: '' -%}
    {%- assign variety    = product.metafields.MAP_NAMESPACE.MAP_VARIETY.value | default: '' -%}
    {%- assign processing = product.metafields.MAP_NAMESPACE.MAP_PROCESS.value | default: '' -%}
    {%- assign notes      = product.metafields.MAP_NAMESPACE.MAP_TASTING_NOTES.value | default: '' -%}
    {%- assign score      = product.metafields.MAP_NAMESPACE.MAP_CUPPING_SCORE.value | default: '' -%}
    {%- assign decaf      = product.metafields.MAP_NAMESPACE.MAP_IS_DECAF.value -%}
    {%- comment -%} Optional short lists (list metafields). Shown as chips and tags. {%- endcomment -%}
    {%- assign flavours   = product.metafields.MAP_NAMESPACE.MAP_FLAVOUR_LIST.value | default: empty_list -%}
    {%- assign tags       = product.metafields.MAP_NAMESPACE.MAP_STYLE_TAGS.value | default: empty_list -%}
    {%- comment -%}
      Optional roast advice, in days since roasting. Leave roast_level blank to
      leave the whole block out. Fixed numbers are fine if most of your
      coffees are alike, or read them from metafields instead.
    {%- endcomment -%}
    {%- assign roast_level    = product.metafields.MAP_NAMESPACE.MAP_ROAST_LEVEL.value | default: '' -%}
    {%- assign rest_days      = 7 -%}
    {%- assign peak_day       = 14 -%}
    {%- assign best_until_day = 30 -%}
    {%- comment -%} ===== END OF MAPPING ===== {%- endcomment -%}

    {%- if share_18g == blank and share_15g == blank -%}{%- continue -%}{%- endif -%}
    {%- unless first_coffee -%},{%- endunless -%}
    {%- assign first_coffee = false %}
    {
      "id": {{ product.handle | json }},
      "name": {{ product.title | json }},
      "url": {{ shop.url | append: product.url | json }},
      "available": {{ product.available | json }},
      "image": {% if product.featured_image %}{{ product.featured_image | image_url: width: 600, format: 'pjpg' | prepend: 'https:' | json }}{% else %}null{% endif %},
      "recipes": [
        {%- if share_18g != blank -%}{ "size": "18g", "share": {{ share_18g | json }} }{%- endif -%}
        {%- if share_18g != blank and share_15g != blank -%}, {% endif -%}
        {%- if share_15g != blank -%}{ "size": "15g", "share": {{ share_15g | json }} }{%- endif -%}
      ],
      {%- if roast_level != blank %}
      "roast": { "level": {{ roast_level | json }}, "rest_days": {{ rest_days }}, "peak_day": {{ peak_day }}, "best_until_day": {{ best_until_day }} },
      {%- endif %}
      "variants": [
        {%- comment -%}
          One entry per bag size, read from a product option named "Size"
          (any capitals). Values such as 250g, 250 g, 1kg or 1 kg become grams.
          The first variant of each size is used. Other option values are
          skipped, and so is a product with no Size option (it shows no bags).
        {%- endcomment -%}
        {%- assign first_variant = true -%}
        {%- assign seen_sizes = '|' -%}
        {%- for option in product.options_with_values -%}
          {%- assign option_name = option.name | downcase -%}
          {%- unless option_name == 'size' -%}{%- continue -%}{%- endunless -%}
          {%- assign size_index = forloop.index0 -%}
          {%- for variant in product.variants -%}
            {%- assign size_value = variant.options[size_index] -%}
            {%- assign size_key = '|' | append: size_value | append: '|' -%}
            {%- if seen_sizes contains size_key -%}{%- continue -%}{%- endif -%}
            {%- assign seen_sizes = seen_sizes | append: size_value | append: '|' -%}
            {%- assign size_lower = size_value | downcase -%}
            {%- if size_lower contains 'kg' -%}
              {%- assign grams = size_lower | remove: 'kg' | strip | times: 1000 | round -%}
            {%- else -%}
              {%- assign grams = size_lower | remove: 'g' | strip | plus: 0 -%}
            {%- endif -%}
            {%- if grams <= 0 -%}{%- continue -%}{%- endif -%}
            {%- unless first_variant -%},{%- endunless -%}
            {%- assign first_variant = false %}
        { "id": {{ variant.id }}, "grams": {{ grams }}, "price": {{ variant.price | divided_by: 100.0 | json }}, "currency": {{ cart.currency.iso_code | json }}, "available": {{ variant.available | json }} }
          {%- endfor -%}
        {%- endfor %}
      ],
      "bean": {
        "roaster": {{ shop.name | json }},
        "country": {{ country | json }},
        "region": {{ region | json }},
        "farm": {{ farm | json }},
        "farmer": {{ farmer | json }},
        "elevation": {{ elevation | append: '' | json }},
        "variety": {{ variety | json }},
        "processing": {{ processing | json }},
        "aromatics": {{ notes | json }},
        "flavours": {{ flavours | json }},
        "tags": {{ tags | json }},
        "cupping_points": {{ score | append: '' | json }},
        "decaffeinated": {% if decaf == true %}true{% else %}false{% endif %}
      }
    }
  {%- endfor %}
{%- endpaginate %}
  ]
}
```

Notes on the template:

- **Only coffees with a share link are listed.** A product with neither link is
  skipped, so you can keep merchandise and gift cards in the same collection.
- **Empty details are fine.** An empty text such as `"farm": ""` is ignored by
  the app. You do not need to remove lines for fields you do not have.
- **Elevation** is one number of metres (such as `1650`). A range such as
  `1600-1800` is ignored, so store the lower figure.
- **Roast advice is optional.** With `roast_level` blank, the whole block is
  left out.
- **Prices** use your store's currency. `add_to_cart` adds the bag to the
  customer's existing cart on your site.
- **Up to 200 coffees** are read. A collection page holds up to 250 products.

### 3. Add the button to your product page

Create a snippet called `xbrw-button.liquid` with the code below, map the same
fields at the top, set your collection handle, and render it in your product
template where you want the button:

```liquid
{% render 'xbrw-button', product: product %}
```

```liquid
{%- comment -%}
  "Open in XBRW++": sends this coffee's recipe and details to the app, and
  points at your coffee list so the app can offer to subscribe.
{%- endcomment -%}

{%- comment -%} ===== MAP YOUR FIELDS (same as the collection template) ===== {%- endcomment -%}
{%- assign share_18g  = product.metafields.MAP_NAMESPACE.MAP_XBLOOM_18G.value -%}
{%- assign share_15g  = product.metafields.MAP_NAMESPACE.MAP_XBLOOM_15G.value -%}
{%- assign country    = product.metafields.MAP_NAMESPACE.MAP_COUNTRY.value | default: '' -%}
{%- assign processing = product.metafields.MAP_NAMESPACE.MAP_PROCESS.value | default: '' -%}
{%- assign variety    = product.metafields.MAP_NAMESPACE.MAP_VARIETY.value | default: '' -%}
{%- assign notes      = product.metafields.MAP_NAMESPACE.MAP_TASTING_NOTES.value | default: '' -%}
{%- comment -%} Your coffee collection's handle, and a short name for your shop (letters only). {%- endcomment -%}
{%- assign coffee_collection = 'MAP_COLLECTION_HANDLE' -%}
{%- assign source_name = 'MAP_YOUR_SHOP_NAME' -%}
{%- comment -%} ===== END OF MAPPING ===== {%- endcomment -%}

{%- assign share = share_18g | default: share_15g -%}
{%- if share != blank -%}
  {%- if share_18g != blank -%}{%- assign size = '18g' -%}{%- else -%}{%- assign size = '15g' -%}{%- endif -%}
  {%- assign product_url = shop.url | append: product.url -%}
  {%- assign feed_url = shop.url | append: '/collections/' | append: coffee_collection | append: '?view=xbrw' -%}
  {%- capture xbrw_link -%}
    xbrw://import?v=1
    &source={{ source_name | url_encode }}
    &feed={{ feed_url | url_encode }}
    &share={{ share | url_encode }}
    &recipe.name={{ product.title | append: ' - ' | append: size | url_encode }}
    &recipe.url={{ product_url | url_encode }}
    &bean.name={{ product.title | url_encode }}
    &bean.roaster={{ shop.name | url_encode }}
    &bean.url={{ product_url | url_encode }}
    {%- if country != blank -%}&bean.country={{ country | url_encode }}{%- endif -%}
    {%- if processing != blank -%}&bean.processing={{ processing | url_encode }}{%- endif -%}
    {%- if variety != blank -%}&bean.variety={{ variety | url_encode }}{%- endif -%}
    {%- if notes != blank -%}&bean.aromatics={{ notes | url_encode }}{%- endif -%}
    {%- if product.featured_image -%}&bean.image={{ product.featured_image | image_url: width: 600, format: 'pjpg' | prepend: 'https:' | url_encode }}{%- endif -%}
  {%- endcapture -%}
  {%- assign xbrw_link = xbrw_link | strip_newlines | replace: ' ', '' -%}
  <a class="button xbrw-link" href="{{ xbrw_link | replace: '&', '&amp;' }}">Open in XBRW++</a>
  <script>
    (function () {
      var ua = navigator.userAgent;
      var android = /Android/i.test(ua);
      var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
      var appPage = 'https://github.com/hessius/XBRW';
      document.querySelectorAll('.xbrw-link').forEach(function (link) {
        var href = link.getAttribute('href');
        if (android) {
          // Opens the app, or the app's page if it is not installed.
          link.setAttribute('href', 'intent://' + href.slice('xbrw://'.length) +
            '#Intent;scheme=xbrw;S.browser_fallback_url=' + encodeURIComponent(appPage) + ';end');
        } else if (!ios) {
          // A computer cannot open a phone app, so show the app's page instead.
          link.setAttribute('href', appPage);
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener');
        }
      });
    })();
  </script>
{%- endif -%}
```

What the link carries:

| Part | Required | What it does |
|---|---|---|
| `v=1` | yes | The link version. |
| `share` | yes | The xBloom share link for the recipe, encoded. |
| `source` | no | A short name for you, recorded with the recipe. |
| `feed` | no | Your list's address, encoded. This is what makes the app offer to subscribe. |
| `recipe.name` | no | What to call the recipe. Older app builds ignore it. |
| `recipe.url` | no | Your page for the coffee. |
| `bean.*` | no | The coffee's details: `name`, `roaster`, `country`, `region`, `farm`, `farmer`, `elevation`, `variety`, `processing`, `aromatics`, `cupping_points`, `decaffeinated` (`1` or `0`), `url`, `image`, and the comma separated lists `flavours` and `tags`. |

Every value must be URL-encoded (Liquid's `url_encode` does this). In HTML,
write `&` in the link as `&amp;`, as the snippet does.

### The Accept header gotcha (Shopify)

Shopify chooses what to send based on the request's `Accept` header. If a
request says it accepts **only** JSON (`Accept: application/json`), Shopify
replies with its own built-in collection data and ignores your template.

The app asks with `Accept: application/json, text/plain, */*`, which gets your
template. But if you test the address with a tool that asks for JSON only, you
will see Shopify's data instead of your list and think the template is broken.
Test in a browser, or with `npm run check-feed` (below), which asks the way
the app does.

Your list will be served as `text/html`. That is fine: the app reads the body
as JSON whatever the content type says.

## Path B: any website

Write one JSON file, upload it anywhere that serves files over https, and use
its address as your `feed`. You update the file when your range changes.

### A minimal file

This is everything that is required: a version, your name, and for each coffee
a name and one recipe link.

```json
{
  "version": 1,
  "roaster": {"name": "Small Batch Roasters"},
  "coffees": [
    {
      "id": "kenya-gichathaini",
      "name": "Kenya Gichathaini AA",
      "available": true,
      "recipes": [{"size": "18g", "share": "https://share-h5.xbloom.com/?id=YOUR_SHARE_ID"}]
    }
  ]
}
```

`id` is optional but strongly recommended: a short name for the coffee that
never changes. It is how the app knows a coffee is new, and which coffee came
back in stock. Without it the app goes by the coffee's name.

`available` should be `true` for coffees on sale. Anything else, or leaving it
out, shows the coffee as sold out.

### A full file

```json
{
  "version": 1,
  "roaster": {
    "name": "Small Batch Roasters",
    "url": "https://smallbatch.example"
  },
  "coffees": [
    {
      "id": "kenya-gichathaini",
      "name": "Kenya Gichathaini AA",
      "url": "https://smallbatch.example/kenya-gichathaini",
      "available": true,
      "image": "https://smallbatch.example/images/kenya-gichathaini-600.jpg",
      "recipes": [
        {"size": "18g", "share": "https://share-h5.xbloom.com/?id=YOUR_18G_SHARE_ID"},
        {"size": "15g", "share": "https://share-h5.xbloom.com/?id=YOUR_15G_SHARE_ID"}
      ],
      "roast": {"level": "Light", "rest_days": 7, "peak_day": 14, "best_until_day": 35},
      "variants": [
        {"id": "kg-250", "grams": 250, "price": 24, "currency": "GBP", "available": true,
         "url": "https://smallbatch.example/kenya-gichathaini?size=250g"},
        {"id": "kg-1000", "grams": 1000, "price": 80, "currency": "GBP", "available": false,
         "url": "https://smallbatch.example/kenya-gichathaini?size=1kg"}
      ],
      "bean": {
        "roaster": "Small Batch Roasters",
        "country": "Kenya",
        "region": "Nyeri",
        "farm": "Gichathaini",
        "elevation": "1750",
        "variety": "SL28, SL34",
        "processing": "Washed",
        "aromatics": "Blackcurrant, grapefruit and a long, sweet finish.",
        "flavours": ["Blackcurrant", "Grapefruit", "Brown Sugar"],
        "tags": ["Fruity", "Filter"],
        "colour": "#1F6F78",
        "cupping_points": "87.5",
        "decaffeinated": false
      }
    }
  ]
}
```

Each bag's `url` is the page or cart link for exactly that bag. If your shop
can add a product to the cart from a link with an id in it, you can instead
set `"add_to_cart": "https://your-shop.example/cart/add?id={variant_id}"` on
`roaster` and give each bag its `id`. A bag with neither shows its size and
price with no button.

If a coffee has bags but no prices, you can list just the sizes:
`"bag_sizes_g": [250, 1000]`.

Unknown fields are ignored, so you can keep your own notes in the file. A
field that breaks a rule is dropped on its own; a coffee is only skipped when
it has no name or no usable recipe.

### The button

On any page, a plain link works. Encode each value (for example with
[an online URL encoder](https://www.urlencoder.org/), or `encodeURIComponent`
in JavaScript), and write `&` as `&amp;` in HTML:

```html
<a class="xbrw-link"
   href="xbrw://import?v=1&amp;source=smallbatch&amp;feed=https%3A%2F%2Fsmallbatch.example%2Fxbrw.json&amp;share=https%3A%2F%2Fshare-h5.xbloom.com%2F%3Fid%3DYOUR_SHARE_ID&amp;recipe.name=Kenya%20Gichathaini%20AA%20-%2018g&amp;bean.name=Kenya%20Gichathaini%20AA&amp;bean.roaster=Small%20Batch%20Roasters&amp;bean.country=Kenya">
  Open in XBRW++
</a>
```

Then add the same short script as in the Shopify snippet (the `<script>`
block) once on the page. On Android it turns the link into one that opens the
app, or the app's page if it is not installed. On a computer it points at the
app's page.

## Images

- **About 600 pixels wide, JPEG, under about 200 KB.** The app shows photos at
  phone size, and a large image only makes your catalogue slower to open.
  Shopify's `image_url: width: 600, format: 'pjpg'` does this for you.
- The address must be https.

## Checklist: test it before you tell customers

1. **Open your list's address in a browser.** You should see text starting
   with `{"version": 1`. If you see your shop's normal page, the template is
   not being used: check the file is named `collection.xbrw.liquid` and the
   address ends in `?view=xbrw`.
2. **Check it reads.** Paste it into a JSON checker such as
   [jsonlint.com](https://jsonlint.com) to catch a missing comma. If you have
   a copy of the XBRW++ code, `npm run check-feed -- <your list's address or
   file>` reads it with the app's own parser and tells you how many coffees
   the app will read and why any were skipped.
3. **Tap the button on an Android phone** with XBRW++ installed. The recipe
   should open in the app with your coffee's details.
4. **Tap the button on an iPhone** with XBRW++ installed. Same result. (On an
   iPhone without the app, Safari says it cannot open the page. That is
   normal.)
5. **Go back to the app's library.** It should ask "Subscribe to {your
   name}?". Say yes, then open Import, then All roasters, and check your
   coffees, photos and prices look right.
6. **Tap BUY on a bag** and check it opens the right product in the browser.

## Questions

**How do new coffees reach my customers?**
The app checks your list when it is opened or brought back to the screen, at
most every 12 hours, and whenever the customer taps Refresh. New coffees then
show as NEW in their catalogue. There are no push notifications and nothing
runs in the background.

**How do restocks reach them?**
The same way. When a sold-out coffee (or bag) that someone asked about shows
`"available": true` on a later check, the app tells them in the app. Keep
`available` accurate and keep each coffee's `id` the same, and this works on
its own. If you take a sold-out coffee off your list and put it back later
with the same `id`, the app still recognises it.

**I changed a recipe. Do customers get the new version?**
Change it on xBloom under the same share link. Anyone opening the coffee from
your catalogue sees your latest version, because the app fetches the recipe
from xBloom at that moment. A copy someone already saved in their library only
changes when they import it again, from your button or your catalogue. If
they have edited their copy, the app asks before replacing it. A new share
link counts as a new recipe.

**Does the app track my customers, or tell me who subscribed?**
No. The app fetches your list directly from your site, like a browser loading
a file, and sends no name, email or account with it. Subscribing, NEW and
back-in-stock all happen on the customer's phone. You may see the requests in
your site's visitor logs, as you would any visit.

**How much traffic will this cause?**
At most one request per subscriber every 12 hours, and only while they are
using the app. A list of thirty coffees is about 35 KB.

**Do I need Shopify?**
No. Any https address that returns the file works.

**Is there any roaster-specific setup in the app?**
No. Every roaster uses the same format and gets the same features.
