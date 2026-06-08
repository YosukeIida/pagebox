export function Layout(props: { title: string; children: any }) {
  return (
    <html lang="ja" data-theme="">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <link rel="stylesheet" href="/static/style.css" />
      </head>
      <body>
        {props.children}
        <script type="module" src="/static/app.js"></script>
      </body>
    </html>
  );
}
