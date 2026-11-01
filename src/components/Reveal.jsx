import { useEffect, useRef, useState } from 'react';

/** Scroll-reveal wrapper (port of the IntersectionObserver over `.reveal` elements). */
export default function Reveal({ as: Tag = 'div', className = '', initiallyIn = false, children, ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(initiallyIn);

  useEffect(() => {
    if (seen || !ref.current) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
      },
      { threshold: 0.15 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);

  return (
    <Tag ref={ref} className={`${className} reveal${seen ? ' in' : ''}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
