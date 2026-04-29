import app from "./app.js";

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`AI4K12 MVP service running at http://localhost:${port}`);
});

