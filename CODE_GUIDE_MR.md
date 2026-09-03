

# WhatsApp Messaging Bot — Code Explanation

This guide explains each custom source file in the project. Files inside `node_modules/` are third-party libraries installed externally, so we do not modify them.

## How the Project Works

`Browser (index.html)` → `Frontend JavaScript` → `API (server.js)` → `WhatsApp Web / Supabase`

* The browser displays the dashboard, and the user interacts with buttons/forms.
* The frontend uses `window.apiFetch()` to send requests to the backend.
* `server.js` sends messages through WhatsApp Web, reads groups/contacts, and uses Supabase for login.
* Temporary UI data such as `groups`, `logs`, `templates`, etc. is stored in the browser's `localStorage`.

## `index.html` — Page Structure

This is the main HTML file.

* The `<head>` contains Google Fonts, `styles.css`, and inline design styles.
* The first `<script>` contains `window.apiFetch()`. It checks which localhost port the API server is running on and then sends the request to the correct URL.
* `#loginScreen` is the login/register screen.
* `.sidebar` contains menu links such as Dashboard, Groups, Send Message, Logs, etc. Each link has a `data-page` attribute, which `app.js` uses to switch pages.
* `#dashboard` contains statistics cards, the Quick Send form, recent activity, and the schedule table.
* `#otherPage` is initially empty. JavaScript dynamically creates pages such as Groups, Templates, and Reports here.
* `#modal` is the popup used to create a schedule.
* `#toast` displays small success/error messages.
* JavaScript files are loaded sequentially at the end. `app.js` controls the main UI, while the other files add additional features.

## `app.js` — Main Frontend Logic

This is the largest and most important browser-side file.

### Data and Small Helpers

* `D` is the default data object containing sample groups, templates, users, and schedules.
* `db` combines the default data with previously saved data from `localStorage`.
* `save()` stores `db` in `localStorage` under the key `wa-bot-data`.
* `$()` is a short form of `document.querySelector()`.
* `e()` escapes HTML special characters so user-entered text is not executed as HTML.
* `toast()` displays a popup message at the bottom.
* `now()` and `formatTs()` format dates and times.

### Attachment Preview

`setupAttachmentHandlers()` displays the files selected through the file input.

* If the file is an image, `FileReader` is used to display a small preview.
* For other files, the file name and size in KB are displayed.

### Functions That Create Dynamic Pages

These functions generate HTML strings and display them inside `#otherPage`:

* `groups()` — Screen for adding/removing/activating groups and test recipients.
* `send()` — Send form containing the message, target, and attachments.
* `templates()` — Reusable message templates.
* `logs()` — Success/failed delivery records.
* `reports()` — Total count, success rate, and CSV export.
* `users()` — Local list of dashboard users.
* `settings()` — WhatsApp connect, QR code, and disconnect buttons.
* `layout()`, `form()`, and `table()` — Common helper functions used to avoid writing the same HTML repeatedly.

### Message Sending

* `queue(message, target)` sends a text-only message.
* If the target is `all`, all active groups are selected; otherwise, the selected group is used.
* A POST request is sent to `/api/whatsapp/send`.
* Each result received from the server is added to `db.logs`, and the dashboard is refreshed.
* Quick Send uses the same process through `#sendBtn.onclick`.
* If an attachment is included, `FormData` is used so the files can be sent to the server.

### Events and Navigation

* `wire(page)` attaches event handlers to buttons/forms after each dynamic page is created.
* Example: when Add Group is submitted on the Groups page, the group is added to `db.groups`. Delete/Use buttons work similarly on the Templates page.
* `navigateToPage()` changes the active sidebar item, page title, and displayed page.
* `routeFromHash()` opens the appropriate page based on URL hashes such as `#groups` or `#send`.
* Schedule data is saved to `db.schedules` through the schedule modal. This is frontend-local scheduling; there is currently no server-side job that automatically sends the message when the scheduled time arrives.

**Note:** Some attachment-preview code appears twice in this file. The feature works, but it can later be refactored into one reusable function.

## `auth.js` — Login and Logout

* `registerMode` determines whether the screen is in Sign In or Create Account mode.
* `setAuthMode()` changes the title, button, and name field.
* On form submission, a JSON request is sent to `/api/auth/register` or `/api/auth/login`.
* After successful login, the `token` and `user` are stored in `localStorage`, and the login screen is hidden.
* After a page refresh, if the saved token/user exists, the user does not need to log in again.
* On logout, these `localStorage` values are removed and the login screen is displayed again.

## `connector.js` — WhatsApp Connection UI

* `fetchJsonSafe()` safely checks whether the API response is valid JSON and provides a useful error message.
* Clicking **Connect / Show QR Code** in Settings calls `/api/whatsapp/status`.
* If WhatsApp is connected, the account is displayed. If a QR code is available, it is displayed as an image.
* The Disconnect button sends a POST request to `/api/whatsapp/disconnect`.
* `syncWhatsAppGroups()` retrieves live WhatsApp groups and updates `localStorage` and `db.groups`.

## `directory.js` — Groups and Contacts Directory

* `renderWhatsAppDirectory()` creates a table of live WhatsApp groups and contacts when the Groups menu is opened.
* It first checks whether WhatsApp is connected.
* Then `/api/whatsapp/groups` and `/api/whatsapp/contacts` are called simultaneously.
* The search input filters table rows, while the Refresh button calls the APIs again.

## `recipient-selector.js` — Recipient Selection and Dashboard Counters

* `updateDynamicDashboard()` calculates sent, successful, and failed counts from local logs and displays them in the dashboard cards.
* `loadRecipientSelector()` replaces the Send Message form with a more powerful recipient selector.
* It provides checkboxes for both groups and contacts, search functionality, and buttons such as Select All Groups, Select All Contacts, Select Visible, and Clear Selection.
* When submitted, the selected recipients and attachments are sent through `FormData` to `/api/whatsapp/send`.

## `live-ui.js` — Live Dashboard Updates

* `refreshLiveDashboard()` retrieves the number of groups and contacts from WhatsApp and updates the dashboard.
* This function runs when the page loads, when the browser receives focus, and every 30 seconds.
* `showScheduledModule()` displays a separate dynamic table for Scheduled Messages and provides a delete action.
* Clicking a statistics card navigates to the corresponding page.

## `server.js` — Backend and WhatsApp Integration

This is the Node/Express server file. The application starts through this file when `npm start` is executed.

### Main Responsibilities

* Creates the Express application and serves static files such as `index.html`, CSS, and JavaScript.
* Uses `dotenv` to read secrets from `.env`.
* Creates the Supabase client, provides registration/login APIs, and creates/validates JWT tokens.
* Starts the `whatsapp-web.js` Client.
* When a WhatsApp QR code is received, `qrcode` converts it into a data URL that can be displayed in the browser.
* Maintains WhatsApp states such as `starting`, `qr`, `connected`, and `auth_failed` in memory, along with the connected account.

### Important API Routes

| Route                           | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `POST /api/auth/register`       | Creates a new Supabase user and returns a JWT.                        |
| `POST /api/auth/login`          | Validates email/password and returns a JWT.                           |
| `GET /api/whatsapp/status`      | Returns the connection state, account, or QR code.                    |
| `POST /api/whatsapp/disconnect` | Resets the WhatsApp client/session and prepares it for a new QR code. |
| `GET /api/whatsapp/groups`      | Returns groups from the linked WhatsApp account.                      |
| `GET /api/whatsapp/contacts`    | Returns individual contacts from the linked WhatsApp account.         |
| `POST /api/whatsapp/send`       | Sends text and/or attachments to selected groups/contacts.            |

### Send Route Process

1. `multer` stores uploaded attachment files in a temporary folder.
2. `message`, `groups`, or `recipients` are read from the request.
3. The WhatsApp ID is identified for each target.
4. For text-only messages, `client.sendMessage(id, message)` is executed.
5. If files are attached, `MessageMedia.fromFilePath()` is used to send each file. The message becomes the caption of the first file.
6. A success/failed result is returned for each target, and temporary uploaded files are deleted.

The server starts on port **3000**. If that port is already busy, it attempts to use the next available port.

## `styles.css` — Main CSS

This file controls the layout and responsive design.

* `:root` contains colors defined as CSS variables.
* It contains styles for the sidebar, topbar, cards, tables, modal, and toast.
* `@media(max-width:1050px)` adjusts the tablet layout and places cards one below another.
* `@media(max-width:760px)` hides/shows the mobile menu.
* Some inline `<style>` rules in `index.html` override these styles to provide a purple/blue **Premium Midnight** design.

## `db.js` — PostgreSQL Helper

`DATABASE_URL` is used to create and export a connection through the `postgres` package.

If `server.js` is currently using Supabase, this file may not be used. Therefore, it should be checked to determine whether it is dead code.

## `test-supabase.js` — Supabase Connection Test

* Reads the Supabase URL and server-side secret key from `.env`.
* Checks that a publishable/anon key has not accidentally been used on the backend.
* Calls `supabase.auth.admin.listUsers()` to verify that the admin connection is working correctly.
* Command to run:

`npm run test:supabase`

## Configuration and Deployment Files

* `package.json` — Project name, `npm start`, test commands, Node version, and libraries.
* `.env` — Private file containing actual secrets. Do not commit it to Git.
* `.env.example` — Safe sample showing which environment variables are required.
* `Dockerfile` — Instructions for running the application inside a Docker container.
* `fly.toml` — Fly.io deployment configuration.
* `.gitignore` — List of files/folders that should not be sent to Git.

## Daily Usage Flow

1. Run `npm start` to start the server.
2. Go to Settings → Connect and scan the WhatsApp QR code.
3. Open Groups and refresh the live groups/contacts.
4. In Send Message, select recipients, add a message/files, and send.
5. The delivery result appears in Delivery Logs and the dashboard counters.


# WhatsApp Messaging Bot — कोड समजावणी

ही guide प्रोजेक्टमधील प्रत्येक स्वतः लिहिलेल्या source file साठी आहे. `node_modules/` मधील files बाहेरून install झालेल्या libraries आहेत; त्या आपण बदलत नाही.

## प्रोजेक्ट कसा चालतो

`Browser (index.html)` → `Frontend JavaScript` → `API (server.js)` → `WhatsApp Web / Supabase`

- Browser मध्ये dashboard दिसतो आणि user button/form वापरतो.
- Frontend `window.apiFetch()` ने backend ला request पाठवतो.
- `server.js` WhatsApp Web ला संदेश पाठवतो, groups/contacts वाचतो आणि login साठी Supabase वापरतो.
- UI मधील तात्पुरता data (`groups`, `logs`, `templates` इ.) browser च्या `localStorage` मध्ये राहतो.

## `index.html` — page ची रचना

ही मुख्य HTML file आहे.

- `<head>` मध्ये Google fonts, `styles.css` आणि inline design styles जोडले आहेत.
- पहिल्या `<script>` मध्ये `window.apiFetch()` आहे. तो API server कोणत्या localhost port वर सुरू आहे ते तपासतो, मग योग्य URL ला request पाठवतो.
- `#loginScreen` हा login/register screen आहे.
- `.sidebar` मध्ये Dashboard, Groups, Send Message, Logs इ. menu links आहेत. प्रत्येक link ला `data-page` आहे; `app.js` त्यावरून page बदलतो.
- `#dashboard` मध्ये statistics cards, Quick Send form, recent activity आणि schedule table आहेत.
- `#otherPage` सुरुवातीला रिकामा आहे. Groups, Templates, Reports सारखे dynamic pages JavaScript इथे तयार करते.
- `#modal` हा schedule तयार करण्याचा popup आहे आणि `#toast` हा छोटा success/error message आहे.
- शेवटी JavaScript files क्रमाने load होतात. `app.js` मुख्य UI आहे; उरलेल्या files त्यात extra feature जोडतात.

## `app.js` — मुख्य frontend logic

ही सर्वात मोठी आणि सर्वात महत्त्वाची browser-side file आहे.

### Data आणि छोटे helpers

- `D` हा default data object आहे: sample groups, templates, users आणि schedules.
- `db` मध्ये default data आणि `localStorage` मधला आधीचा data एकत्र येतो.
- `save()` `db` ला `wa-bot-data` नावाने localStorage मध्ये ठेवतो.
- `$()` हा `document.querySelector()` चा short form आहे.
- `e()` HTML special characters escape करतो. त्यामुळे user ने टाकलेला text HTML म्हणून execute होत नाही.
- `toast()` खाली popup message दाखवतो.
- `now()` आणि `formatTs()` date/time format करतात.

### Attachment preview

`setupAttachmentHandlers()` file input बदलला की निवडलेल्या files दाखवतो.

- Image असल्यास `FileReader` ने छोटा preview दिसतो.
- इतर file असल्यास file name आणि KB मध्ये size दिसते.

### Dynamic page तयार करणारे functions

हे functions HTML string बनवून `#otherPage` मध्ये दाखवतात:

- `groups()` — group आणि test recipient add/remove/activate करण्याची screen.
- `send()` — message, target आणि attachments असलेला send form.
- `templates()` — reusable message templates.
- `logs()` — success/failed delivery records.
- `reports()` — total/success rate आणि CSV export.
- `users()` — dashboard users ची local list.
- `settings()` — WhatsApp connect, QR आणि disconnect buttons.
- `layout()`, `form()`, `table()` हे common HTML पुन्हा पुन्हा न लिहिण्यासाठी helper functions आहेत.

### Message sending

- `queue(message, target)` text-only message पाठवतो.
- Target `all` असेल तर सर्व active groups निवडतो; नाहीतर निवडलेला group घेतो.
- `/api/whatsapp/send` ला POST request जाते.
- Server कडून आलेल्या प्रत्येक result ची entry `db.logs` मध्ये जाते आणि dashboard refresh होतो.
- Quick Send साठी `#sendBtn.onclick` अशीच प्रक्रिया करतो. Attachment असल्यास `FormData` वापरतो; त्यामुळे files server पर्यंत जातात.

### Events आणि navigation

- `wire(page)` प्रत्येक dynamic page तयार झाल्यानंतर त्या page वरील buttons/forms चे handlers जोडतो.
- उदाहरण: Groups page वर Add Group submit झाल्यावर group `db.groups` मध्ये add होतो; Templates page वर delete/use buttons काम करतात.
- `navigateToPage()` sidebar मधील active item, title आणि दिसणारा page बदलतो.
- `routeFromHash()` URL मधील `#groups`, `#send` अशा hash वरून योग्य page उघडतो.
- schedule modal मधून data `db.schedules` मध्ये save होतो. ही frontend-local scheduling आहे; server-side वेळ येताच message पाठवण्याची job इथे नाही.

टीप: या file मध्ये attachment preview साठी काही code दोनदा आहे. Feature चालतो, पण नंतर refactor करून एकाच reusable function मध्ये ठेवता येईल.

## `auth.js` — login आणि logout

- `registerMode` ठरवतो की screen Sign In आहे की Create Account.
- `setAuthMode()` title, button आणि name field बदलतो.
- Form submit वर `/api/auth/register` किंवा `/api/auth/login` ला JSON request जाते.
- Success झाल्यावर `token` आणि `user` localStorage मध्ये ठेवले जातात आणि login screen hide होतो.
- Page refresh नंतर saved token/user असेल तर user ला पुन्हा login करावा लागत नाही.
- Logout वर ते localStorage values काढून login screen परत दाखवली जाते.

## `connector.js` — WhatsApp connection UI

- `fetchJsonSafe()` API response JSON आहे का ते सुरक्षितपणे तपासतो आणि चांगला error message देतो.
- Settings मधील **Connect / show QR code** क्लिक केल्यावर `/api/whatsapp/status` call होतो.
- WhatsApp connected असल्यास account दाखवतो; QR मिळाल्यास तो image म्हणून दाखवतो.
- Disconnect button `/api/whatsapp/disconnect` ला POST request पाठवतो.
- `syncWhatsAppGroups()` connected WhatsApp मधले live groups घेऊन localStorage आणि `db.groups` update करतो.

## `directory.js` — Groups आणि Contacts directory

- `renderWhatsAppDirectory()` Groups menu उघडल्यावर live WhatsApp groups आणि contacts ची table बनवतो.
- आधी WhatsApp connected आहे का तपासतो.
- नंतर `/api/whatsapp/groups` आणि `/api/whatsapp/contacts` हे दोन्ही API एकाच वेळी call करतो.
- Search input table rows filter करतो; Refresh button पुन्हा API call करतो.

## `recipient-selector.js` — recipient selection आणि dashboard counters

- `updateDynamicDashboard()` local logs मधून sent, successful आणि failed counts काढून cards मध्ये दाखवतो.
- `loadRecipientSelector()` Send Message form ला अधिक शक्तिशाली selector ने replace करतो.
- यात groups आणि contacts दोन्हींसाठी checkbox असतात, search असते आणि Select all groups/contacts/visible/Clear selection buttons असतात.
- Submit वर निवडलेल्या recipients ची list आणि attachments `FormData` मधून `/api/whatsapp/send` ला जाते.

## `live-ui.js` — live dashboard updates

- `refreshLiveDashboard()` WhatsApp मधून groups आणि contacts ची संख्या घेऊन dashboard update करतो.
- हा function page load वर, browser focus झाल्यावर आणि प्रत्येक 30 seconds नंतर चालतो.
- `showScheduledModule()` Scheduled Messages साठी वेगळी dynamic table दाखवतो आणि delete action देतो.
- Stat cards क्लिक केल्यावर संबंधित page ला navigation होते.

## `server.js` — backend आणि WhatsApp integration

ही Node/Express server file आहे. `npm start` चालवल्यावर हिच्यामुळे application सुरू होते.

### मुख्य कामे

- Express app तयार करणे आणि `index.html`/CSS/JS सारख्या static files serve करणे.
- `dotenv` वापरून `.env` मधील secrets वाचणे.
- Supabase client तयार करणे, registration/login API देणे आणि JWT token बनवणे/तपासणे.
- `whatsapp-web.js` चा `Client` सुरू करणे.
- WhatsApp QR मिळाल्यावर `qrcode` ने browser मध्ये दाखवण्यासाठी data URL बनवणे.
- WhatsApp state (`starting`, `qr`, `connected`, `auth_failed` इ.) आणि connected account memory मध्ये ठेवणे.

### महत्त्वाचे API routes

| Route | काम |
| --- | --- |
| `POST /api/auth/register` | नवीन Supabase user तयार करतो आणि JWT देतो. |
| `POST /api/auth/login` | email/password तपासून JWT देतो. |
| `GET /api/whatsapp/status` | connected state, account किंवा QR पाठवतो. |
| `POST /api/whatsapp/disconnect` | WhatsApp client/session reset करून नवीन QR साठी तयार करतो. |
| `GET /api/whatsapp/groups` | linked WhatsApp मधले groups पाठवतो. |
| `GET /api/whatsapp/contacts` | linked WhatsApp मधले individual contacts पाठवतो. |
| `POST /api/whatsapp/send` | text आणि/किंवा attachments निवडलेल्या groups/contacts ना पाठवतो. |

### Send route ची प्रक्रिया

1. `multer` uploaded attachment files तात्पुरत्या folder मध्ये ठेवतो.
2. Request मधून `message`, `groups` किंवा `recipients` वाचले जातात.
3. प्रत्येक target साठी WhatsApp ID शोधला जातो.
4. Text-only असल्यास `client.sendMessage(id, message)` चालते.
5. Files असल्यास `MessageMedia.fromFilePath()` करून प्रत्येक file पाठवली जाते; message पहिल्या file ची caption बनतो.
6. प्रत्येक target चा success/failed result JSON मध्ये परत जातो आणि temporary uploaded files delete होतात.

Server 3000 port वर सुरू होतो. तो port busy असेल तर पुढचा port वापरण्याचा प्रयत्न करतो.

## `styles.css` — मुख्य CSS

ही file layout आणि responsive design सांभाळते.

- `:root` मध्ये colors CSS variables म्हणून define आहेत.
- Sidebar, topbar, cards, tables, modal, toast यांचे styles आहेत.
- `@media(max-width:1050px)` tablet layout साठी cards एकाखाली एक करते.
- `@media(max-width:760px)` mobile menu hide/show करते.
- `index.html` मधील inline `<style>` काही styles override करून purple/blue “premium midnight” look देतो.

## `db.js` — PostgreSQL helper

`DATABASE_URL` वापरून `postgres` package चे connection तयार करून export करतो. सध्या `server.js` Supabase वापरत असेल तर ही file वापरली जात नसण्याची शक्यता आहे. त्यामुळे dead code आहे का ते वापर शोधून ठरवता येईल.

## `test-supabase.js` — Supabase connection test

- `.env` मधून Supabase URL आणि server-side secret key शोधतो.
- Publishable/anon key चुकून backend मध्ये वापरली नाही याची तपासणी करतो.
- `supabase.auth.admin.listUsers()` call करून admin connection योग्य आहे का ते console मध्ये सांगतो.
- चालवण्याची command: `npm run test:supabase`

## Configuration/deployment files

- `package.json` — project name, `npm start`, test command, Node version आणि libraries.
- `.env` — खरे secrets ठेवण्याची private file. ती Git मध्ये commit करू नका.
- `.env.example` — कोणते environment variables लागतात याचा सुरक्षित sample.
- `Dockerfile` — Docker container मध्ये app run करण्याच्या सूचना.
- `fly.toml` — Fly.io वर deploy करण्याची configuration.
- `.gitignore` — Git मध्ये न पाठवायच्या files/folders ची यादी.

## रोजच्या वापराचा flow

1. `npm start` करून server सुरू करा.
2. Settings → Connect वर जाऊन WhatsApp QR scan करा.
3. Groups उघडून live groups/contacts refresh करा.
4. Send Message मध्ये recipients निवडा, message/files जोडा आणि send करा.
5. Result Delivery Logs व dashboard counters मध्ये दिसेल.

