// Cableado del formulario de acceso anticipado con DynamoDB y SES (SDK v3 del
// runtime nodejs22.x, sin dependencias empaquetadas). La lógica vive en alta.mjs.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import { crearHandler } from "./alta.mjs";

const TABLE = process.env.WAITLIST_TABLE;
const FROM = process.env.SES_FROM_ADDRESS;
const CONFIG_SET = process.env.SES_CONFIG_SET || undefined;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});

const almacen = {
  async guardarSiNoExiste(item) {
    try {
      await ddb.send(new PutCommand({ TableName: TABLE, Item: item, ConditionExpression: "attribute_not_exists(email)" }));
      return true;
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") return false;
      throw err;
    }
  },
  async contarPeticion(clave, ttl) {
    // `ttl` y `partition` son palabras reservadas de DynamoDB: van con alias.
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { email: clave },
        UpdateExpression: "ADD #c :uno SET #ttl = :ttl, #p = :p",
        ExpressionAttributeNames: { "#c": "count", "#ttl": "ttl", "#p": "partition" },
        ExpressionAttributeValues: { ":uno": 1, ":ttl": ttl, ":p": "ratelimit" },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return res.Attributes?.count ?? 1;
  },
};

const correo = {
  enviar: ({ to, subject, text, tipo }) =>
    ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Text: { Data: text, Charset: "UTF-8" } } } },
        ConfigurationSetName: CONFIG_SET,
        EmailTags: [{ Name: "type", Value: tipo }],
      }),
    ),
};

export const handler = crearHandler({
  almacen,
  correo,
  config: {
    notify: process.env.NOTIFY_ADDRESS,
    siteUrl: process.env.SITE_URL,
    rateLimitPerHour: Number.parseInt(process.env.RATE_LIMIT_PER_IP_HOUR ?? "5", 10),
  },
});
