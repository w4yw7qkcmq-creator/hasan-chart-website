"use client";

import dynamic from "next/dynamic";

const CopyArticleButton = dynamic(() => import("../../components/CopyArticleButton"), {
  ssr: false,
  loading: () => null,
});

export default function CopyArticleButtonClientOnly(props) {
  return <CopyArticleButton {...props} />;
}
