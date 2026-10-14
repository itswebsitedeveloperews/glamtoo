declare module 'virtual:storefront-images' {
  const images: Record<string, { src: string; srcSet: string; width: number; height: number }>;
  export default images;
}
