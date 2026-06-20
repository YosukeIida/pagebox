// ボタン共通コンポーネント。
// href があれば <a>、なければ <button> を描画する。
// id / type / target / rel / data-copy-url / data-delete-slug 等は rest で受けてそのまま付与する。

type ButtonVariant = "primary" | "secondary" | "danger";

interface ButtonProps {
  variant?: ButtonVariant;
  href?: string;
  children?: any;
  // id / type / target / rel / data-* などをそのまま透過させる
  [key: string]: any;
}

export function Button(props: ButtonProps) {
  const { variant = "secondary", href, children, ...rest } = props;
  const cls = `btn btn-${variant}`;

  if (href !== undefined) {
    return (
      <a class={cls} href={href} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button class={cls} {...rest}>
      {children}
    </button>
  );
}
