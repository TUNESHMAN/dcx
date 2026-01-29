# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

# dcx

Tech consultancies often have “bench” talent (available people) and need an easy way to keep this information current and visible across a trusted network of partner consultancies. At the same time, opportunities/roles come in and the group needs a fast way to see who is available, with what skills, and how recently the info was updated.

aws lambda invoke --profile babs --region eu-west-2 --function-name run-migrations-develop --payload '{}' out.json && cat out.json

aws dsql generate-db-auth-token \
 --profile babs \
 --region eu-west-2 \
 --endpoint c5tplkfngmzcpswzy5gqdbkbuu.dsql.eu-west-2.on.aws \
 --username admin

aws lambda invoke \  
 --profile babs \
 --region eu-west-2 \
 --function-name run-migrations-develop \
 --payload '{}' \
 out.json && cat out.json

Do users have to call two endpoints?
Not necessarily. There are two patterns:
Pattern A: Two-step (most common, simplest)

1. Client asks for upload URL
2. Client uploads to S3
3. Client calls create-consultancy with the logo metadata
   Calls:

- POST /v1/consultancy/logo-upload-url
- PUT <presignedUrl> (to S3, not your API)
- POST /v1/consultancy
  So it feels like 2 API endpoints, but the middle PUT is direct to S3.
  ✅ Pros: very robust, scalable, cheapest❌ Cons: client does a tiny bit more work

Flow (what happens when user selects a file)

1. UI calls your API: POST /v1/consultancy-logo-upload-url
2. API returns:
   - uploadUrl (pre-signed S3 PUT)
   - key (S3 object key)
   - url (final public URL if using CloudFront/public bucket, or just a “download endpoint” later)
3. UI uploads directly to S3: PUT uploadUrl with Content-Type: image/...
4. When user submits the consultancy form, UI sends: \* logo: { key, url, contentType } inside POST /v1/consultancy
   That’s still one user action (select file), and your backend stays lean.

key is what you store in DSQL later (logo_key)
url is what the UI can show immediately (if the bucket is private, this won’t work yet — we can instead return a GET endpoint later)
uploadUrl is short-lived and used immediately by the browser

The bucket is private and won’t load on the browser. I put cloud front in front

Set a lifecycle rule to delete files in tmp

Use cloudfront + OAC for the logos to keep the s3 bucket private

Absolutely — here’s the frontend-facing flow, explained plainly and end-to-end, without backend jargon.

Creating a Consultancy — Frontend Flow (Simple & Practical)
From the user’s point of view, this is one form with a logo upload and a submit button.
Behind the scenes, the frontend makes two API calls (plus one direct S3 upload).

1️⃣ User opens “Create Consultancy” page
The frontend:

- Renders the form fields:
  _ Name
  _ About us
  _ Website
  _ Location
  _ Specialty skills
  _ Logo upload input
  No API calls yet.

2️⃣ User selects a logo file (📁 Upload happens here)
This is the important part: the logo upload happens immediately, not on submit.
Frontend action
When the user selects a file:

- The frontend does NOT upload the file to your API
- Instead, it asks your backend for permission to upload
  API call #1 — Get upload permission
  POST /v1/consultancy/logo-upload
  Payload
  {
  "contentType": "image/png",
  "fileName": "logo.png"
  }
  Backend does
- Validates file type
- Generates a pre-signed S3 PUT URL
- Returns:
  _ where the file should live (key)
  _ where it will be viewable (url – CloudFront) \* how to upload it (uploadUrl)
  Response
  {
  "key": "consultancies/logos/tmp/lo_abc123/logo.png",
  "uploadUrl": "https://s3-presigned-url...",
  "url": "https://cdn.example.com/consultancies/logos/tmp/lo_abc123/logo.png"
  }

3️⃣ Frontend uploads the file directly to S3
This is not an API call to your backend.
Frontend action
PUT uploadUrl
Content-Type: image/png
(binary file data)
Result

- File is now stored in S3
- Immediately viewable via CloudFront
- Frontend stores this in local state:
  logo = {
  key,
  url,
  contentType
  };
  If the user abandons the form:
- The logo stays in a temporary folder
- S3 lifecycle deletes it later automatically

4️⃣ User fills the rest of the form
While or after the logo upload:

- User completes text fields
- User selects skills
- User clicks Create Consultancy
  Still just one button click for the user.

5️⃣ User submits the form
Now the frontend sends everything at once, including the logo metadata.
API call #2 — Create consultancy
POST /v1/consultancy
Payload
{
"name": "Acme Digital Consulting",
"aboutUs": "We specialise in modern frontend and QA automation.",
"website": "https://acme.example",
"location": {
"country": "United Kingdom",
"city": "London",
"region": "Greater London",
"timezone": "Europe/London"
},
"specialtySkillIds": ["sk_123", "sk_456"],
"logo": {
"key": "consultancies/logos/tmp/lo_abc123/logo.png",
"url": "https://cdn.example.com/consultancies/logos/tmp/lo_abc123/logo.png",
"contentType": "image/png"
}
}

6️⃣ Backend creates the consultancy
The backend:

- Validates the payload
- Creates a consultancy record in DSQL
- Stores:
  - consultancy details
  - logo metadata (key + URL)
- Inserts specialty skills into the join table
- Commits everything in one transaction
  Response
  {
  "message": "Consultancy created successfully",
  "createdConsultancy": {
  "consultancyId": "co_123",
  "name": "Acme Digital Consulting",
  "logo": {
  "url": "https://cdn.example.com/consultancies/logos/tmp/lo_abc123/logo.png"
  }
  }
  }
  Frontend can now:
- Redirect to consultancy detail page
- Show success toast
- Display the logo immediately

7️⃣ What happens later (automatically)

- If consultancy was created → logo remains
- If consultancy was never created → logo is deleted by S3 lifecycle
- No cleanup Lambda needed

Summary (mental model for frontend devs)
Logo upload is a background action triggered by file selection.Form submission is still one user action.
API calls made:

1. POST /consultancy/logo-upload → get upload permission
2. PUT uploadUrl → upload file to S3
3. POST /consultancy → create consultancy record
   Why this is good

- Fast UX
- No large payloads through your API
- Scales well
- No orphaned data long-term

If you want next:

- I can write this as frontend pseudocode
- Or show how this looks in React (with hooks)
- Or diagram the flow in one picture

Here’s the exact Postman step-by-step to test the logo upload + consultancy creation flow (Option A: upload on file select).

Step 0: Prepare
Have an image file ready on your machine, e.g. logo.png.

Step 1: Call your logo-upload (presign) endpoint
This endpoint does NOT accept the image. It returns a pre-signed S3 PUT URL.
Postman request

- Method: POST
- URL:https://<your-api-domain>/api/v1/consultancy/logo-upload(use your actual API Gateway base URL)
- Headers:
  - Content-Type: application/json
- Body: raw → JSON
  {
  "contentType": "image/png",
  "fileName": "logo.png"
  }
  Expected response (example)
  {
  "key": "consultancies/logos/tmp/lo_abc123/logo.png",
  "uploadUrl": "https://s3....(very long presigned url)...",
  "url": "https://<cloudfront-domain>/consultancies/logos/tmp/lo_abc123/logo.png"
  }
  ✅ Copy these values somewhere:
- uploadUrl
- key
- url
- contentType

Step 2: Upload the actual image to S3 using the uploadUrl
This request is not sent to your API. It goes straight to S3.
Postman request

- Method: PUT
- URL: paste the returned uploadUrl
- Headers:
  - Content-Type: image/png (must match what you requested)
- Body: binary
  _ Click Select File
  _ Choose logo.png
  Expected response
- Status: 200 OK (or 204)
- Body usually empty
  ✅ At this point the file is in S3.

Step 3: Confirm the logo is viewable
Open the returned url (CloudFront URL) in a browser.

- It should display the image.
- If you get 403/404, wait a minute (new distributions can take a bit) and retry.
- If it still fails, it’s usually CloudFront OAC/bucket policy or you’re not returning the CloudFront URL.

Step 4: Create the consultancy using the stored logo metadata
Now you create the consultancy and include the logo metadata you got from step 1.
Postman request

- Method: POST
- URL:https://<your-api-domain>/api/v1/consultancy
- Headers:
  - Content-Type: application/json
- Body: raw → JSON
  {
  "name": "Acme Digital Consulting",
  "aboutUs": "We specialise in modern frontend and QA automation.",
  "website": "https://acme.example",
  "location": {
  "country": "United Kingdom",
  "city": "London",
  "region": "Greater London",
  "timezone": "Europe/London"
  },
  "specialtySkillIds": [],
  "logo": {
  "key": "PASTE_KEY_FROM_STEP_1",
  "url": "PASTE_URL_FROM_STEP_1",
  "contentType": "image/png"
  }
  }
  Expected response
- 201 Created
- JSON includes a consultancyId
- Returned consultancy includes logo fields (or at least logoUrl, depending on your DTO)

Step 5: Verify in DBeaver (optional but useful)
Run:
select consultancy_id, name, logo_key, logo_url, created_at
from dcx.consultancies
order by created_at desc
limit 5;
You should see the logo fields populated.

Common mistakes (and how to avoid)
❌ Sending the image file to /logo-upload
/logo-upload expects JSON only (contentType/fileName).The image bytes must go to the returned uploadUrl via PUT.
❌ Wrong content-type on the PUT upload
The PUT request must use the same Content-Type you requested when presigning.
❌ Trying to view the S3 URL instead of CloudFront
If your bucket is private, only the CloudFront URL will work.

If you want, paste the response you get from Step 1 (redact the long uploadUrl) and I’ll tell you exactly what to paste into Step 4 and whether your CloudFront URL is being generated correctly.

Your UPDATE ... WHERE skill_id = $1 RETURNING ... already tells you everything:

- If the skill exists → you get 1 row returned
- If it doesn’t → you get 0 rows returned → return 404
  So doing a “SELECT first” would just add:
- an extra DB round trip
- extra latency
- extra cost
- a race condition anyway (it could be deleted between SELECT and UPDATE)
  This pattern is the standard approach in SQL APIs.

Guardrails implemented

- ✅ If skill is deprecated → you can update aliases and category only
- ❌ If skill is deprecated → name updates are blocked
- ❌ status updates are not allowed at all in this PATCH (reserved for delete/deprecate endpoint)
- ✅ Existence check before update
- ✅ Fixes your param-indexing bug
- ✅ Returns the updated skill in the response







import { Pool } from "pg";
import { logger } from "../logger/logger";
import { getDbPool } from "./db-pool"; // your shared pool factory

export async function createItem(
tableName: string,
item: Record<string, any>
): Promise<void> {
const pool = await getDbPool();

const keys = Object.keys(item);
const values = Object.values(item);
const placeholders = keys.map((\_, i) => `$${i + 1}`).join(", ");

const query = `    INSERT INTO ${tableName} (${keys.join(", ")})
    VALUES (${placeholders})
 `;

try {
await pool.query(query, values);
} catch (error) {
logger.error("Error creating item", { error, tableName, item });
throw error;
}
}

export async function fetchAllItems<T>(
tableName: string
): Promise<T[]> {
const pool = await getDbPool();
const query = `SELECT * FROM ${tableName}`;

try {
const result = await pool.query(query);
return result.rows as T[];
} catch (error) {
logger.error("Error fetching items", { error, tableName });
throw error;
}
}

export async function fetchOneById<T>(
tableName: string,
idColumn: string,
id: string
): Promise<T | null> {
const pool = await getDbPool();
const query = `SELECT * FROM ${tableName} WHERE ${idColumn} = $1 LIMIT 1`;

try {
const result = await pool.query(query, [id]);
return (result.rows[0] ?? null) as T | null;
} catch (error) {
logger.error("Error fetching item", { error, tableName, idColumn, id });
throw error;
}
}

export async function updateItemById(
tableName: string,
idColumn: string,
id: string,
updates: Record<string, any>
): Promise<void> {
const pool = await getDbPool();

const keys = Object.keys(updates);
const values = Object.values(updates);

const setClause = keys
.map((key, i) => `${key} = $${i + 1}`)
.join(", ");

const query = `    UPDATE ${tableName}
    SET ${setClause}
    WHERE ${idColumn} = $${keys.length + 1}
 `;

try {
await pool.query(query, [...values, id]);
} catch (error) {
logger.error("Error updating item", {
error,
tableName,
idColumn,
id,
updates,
});
throw error;
}
}

////

catch (err: any) {
// unique violation on name_lower
if (err?.code === "23505") {
await client.query("ROLLBACK").catch(() => undefined);
metrics.addMetric("CreateSkillNameConflict", MetricUnit.Count, 1);

        return {
          statusCode: 409,
          body: JSON.stringify({
            message: "A skill with this name already exists.",
            code: "SkillNameConflict",
          }),
        };
      }

      throw err;
    }

My current transition is due to redundancy rather than performance or fit. I was working within a consultancy, and the business experienced a slowdown in incoming projects, which led to a reduction in roles across the team. I’m proud of the work I delivered there and left on good terms with a settlement agreement.
While that change wasn’t something I had planned, it has given me the opportunity to reflect on the type of environment I want to move into next. I’m now looking for a role where I can contribute to longer-term product development, work more deeply within a stable engineering team, and continue growing technically — particularly in building scalable, high-quality web applications that have a meaningful user impact.
I see this as a positive next step rather than a setback, and I’m excited to bring my experience into a team where I can add value consistently over the long term.
