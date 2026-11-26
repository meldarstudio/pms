declare module "*?room-gallery" {
  const image: {
    original: import("astro").ImageMetadata;
    src: string;
    srcSet: string;
    sizes: string;
    full: string;
  };
  export default image;
}
