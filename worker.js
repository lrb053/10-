const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};


const LINE_VERIFY_URL =
  "https://api.line.me/oauth2/v2.1/verify";


const CHANNEL_ID =
  "2011088879";


export default {

  async fetch(request, env) {

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {
          status: 204,
          headers: CORS_HEADERS
        }
      );

    }


    const url =
      new URL(request.url);


    try {

      /*
      ========================================================
        HEALTH CHECK
      ========================================================
      */

      if (
        request.method === "GET" &&
        url.pathname === "/"
      ) {

        return json({
          ok: true,
          service: "Friend Card API"
        });

      }


      /*
      ========================================================
        LOGIN / USER
      ========================================================
      */

      if (
        request.method === "POST" &&
        url.pathname === "/api/me"
      ) {

        return await handleMe(
          request,
          env
        );

      }


      /*
      ========================================================
        CREATE SHARE
      ========================================================
      */

      if (
        request.method === "POST" &&
        url.pathname === "/api/share"
      ) {

        return await handleCreateShare(
          request,
          env
        );

      }


      /*
      ========================================================
        OPEN TOKEN
      ========================================================
      */

      if (
        request.method === "GET" &&
        url.pathname === "/open"
      ) {

        return await handleOpen(
          request,
          env
        );

      }


      /*
      ========================================================
        DASHBOARD
      ========================================================
      */

      if (
        request.method === "POST" &&
        url.pathname === "/api/dashboard"
      ) {

        return await handleDashboard(
          request,
          env
        );

      }


      return json(
        {
          ok: false,
          error: "Not Found"
        },
        404
      );


    } catch (error) {

      console.error(error);

      return json(
        {
          ok: false,
          error: "Internal server error"
        },
        500
      );

    }

  }

};


/*
================================================================
  /api/me
================================================================
*/

async function handleMe(
  request,
  env
) {

  const body =
    await request.json();


  const idToken =
    body.idToken;


  if (!idToken) {

    return json(
      {
        ok: false,
        error: "Missing idToken"
      },
      400
    );

  }


  const profile =
    await verifyLineIdToken(
      idToken
    );


  await env.DB
    .prepare(`
      INSERT INTO users (
        line_user_id,
        display_name,
        picture_url
      )
      VALUES (?, ?, ?)

      ON CONFLICT(line_user_id)
      DO UPDATE SET

        display_name = excluded.display_name,

        picture_url = excluded.picture_url,

        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      profile.sub,
      profile.name || "",
      profile.picture || ""
    )
    .run();


  return json({
    ok: true,

    user: {
      lineUserId: profile.sub,
      displayName: profile.name || "",
      pictureUrl: profile.picture || ""
    }
  });

}


/*
================================================================
  /api/share
================================================================
*/

async function handleCreateShare(
  request,
  env
) {

  const body =
    await request.json();


  const idToken =
    body.idToken;


  const cardId =
    Number(body.cardId);


  if (!idToken) {

    return json(
      {
        ok: false,
        error: "Missing idToken"
      },
      400
    );

  }


  if (
    !Number.isInteger(cardId) ||
    cardId < 1 ||
    cardId > 10
  ) {

    return json(
      {
        ok: false,
        error: "Invalid cardId"
      },
      400
    );

  }


  const profile =
    await verifyLineIdToken(
      idToken
    );


  const token =
    crypto.randomUUID();


  await env.DB
    .prepare(`
      INSERT INTO shares (
        token,
        sender_line_user_id,
        card_id
      )
      VALUES (?, ?, ?)
    `)
    .bind(
      token,
      profile.sub,
      cardId
    )
    .run();


  const openUrl =
    `${env.PUBLIC_BASE_URL}/open?token=${encodeURIComponent(token)}`;


  return json({

    ok: true,

    token,

    openUrl

  });

}


/*
================================================================
  /open
================================================================

  คนรับกดลิงก์จาก Flex
================================================================
*/

async function handleOpen(
  request,
  env
) {

  const url =
    new URL(request.url);


  const token =
    url.searchParams.get(
      "token"
    );


  if (!token) {

    return new Response(
      "Invalid token",
      {
        status: 400,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      }
    );

  }


  const share =
    await env.DB
      .prepare(`
        SELECT *
        FROM shares
        WHERE token = ?
        LIMIT 1
      `)
      .bind(token)
      .first();


  if (!share) {

    return new Response(
      "ไม่พบการ์ดนี้",
      {
        status: 404,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      }
    );

  }


  /*
   * ตอนนี้เราบันทึกว่า Token ถูกเปิดแล้ว
   *
   * ถ้าผู้เปิดยังไม่ได้ Login
   * opened_by_line_user_id จะยังเป็น NULL
   */

  await env.DB
    .prepare(`
      UPDATE shares

      SET opened_at =
        COALESCE(
          opened_at,
          CURRENT_TIMESTAMP
        )

      WHERE token = ?
    `)
    .bind(token)
    .run();


  /*
   * Redirect ไป LIFF
   *
   * ต่อไปเราสามารถทำหน้า Card Viewer
   * ให้สวยกว่านี้ได้
   */

  const destination =
    `${env.LIFF_URL}?token=${encodeURIComponent(token)}`;


  return Response.redirect(
    destination,
    302
  );

}


/*
================================================================
  /api/dashboard
================================================================
*/

async function handleDashboard(
  request,
  env
) {

  const body =
    await request.json();


  const idToken =
    body.idToken;


  if (!idToken) {

    return json(
      {
        ok: false,
        error: "Missing idToken"
      },
      400
    );

  }


  const profile =
    await verifyLineIdToken(
      idToken
    );


  const rows =
    await env.DB
      .prepare(`
        SELECT

          card_id,

          COUNT(*) AS sent_count,

          SUM(
            CASE
              WHEN opened_at IS NOT NULL
              THEN 1
              ELSE 0
            END
          ) AS opened_count

        FROM shares

        WHERE sender_line_user_id = ?

        GROUP BY card_id

        ORDER BY card_id
      `)
      .bind(profile.sub)
      .all();


  const result =
    [];


  for (
    let cardId = 1;
    cardId <= 10;
    cardId++
  ) {

    const row =
      rows.results.find(
        item =>
          Number(item.card_id) === cardId
      );


    const sent =
      row
        ? Number(row.sent_count)
        : 0;


    const opened =
      row
        ? Number(row.opened_count)
        : 0;


    result.push({

      cardId,

      sent,

      opened,

      notOpened:
        sent - opened

    });

  }


  return json({

    ok: true,

    cards: result

  });

}


/*
================================================================
  VERIFY LINE ID TOKEN
================================================================
*/

async function verifyLineIdToken(
  idToken
) {

  const form =
    new URLSearchParams();


  form.set(
    "id_token",
    idToken
  );


  form.set(
    "client_id",
    CHANNEL_ID
  );


  const response =
    await fetch(
      LINE_VERIFY_URL,
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body: form.toString()

      }
    );


  if (!response.ok) {

    throw new Error(
      "Invalid LINE ID token"
    );

  }


  const profile =
    await response.json();


  if (
    profile.iss !==
    "https://access.line.me"
  ) {

    throw new Error(
      "Invalid token issuer"
    );

  }


  if (
    profile.aud !==
    CHANNEL_ID
  ) {

    throw new Error(
      "Invalid channel"
    );

  }


  if (
    !profile.sub
  ) {

    throw new Error(
      "Missing LINE user ID"
    );

  }


  return profile;

}


/*
================================================================
  JSON RESPONSE
================================================================
*/

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {

      status,

      headers: {
        ...CORS_HEADERS,

        "Content-Type":
          "application/json; charset=utf-8"
      }

    }
  );

}
