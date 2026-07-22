// Call the MiMo language model. Needs MIMO_API_KEY in .env

export async function askMimo(prompt: string): Promise<string> {
  const res = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MIMO_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mimo-v2.5",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`MiMo API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("MiMo API returned no message content");
  }

  return content;
}
