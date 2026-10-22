'use client';

import React, { useEffect, useRef, useState } from 'react';
import { testimonials } from './content';
import { Container, Icon, Reveal, Section, SectionHeading } from './primitives';

type Review = {
  id: string;
  author: string;
  school: string | null;
  message: string;
  rating: number;
};

/**
 * Section témoignages — rendu strictement conditionnel.
 * Si aucun avis validé n'existe, la section n'est pas rendue du tout
 * (pas de formulaire vide, pas de phrase défensive).
 */
export function TestimonialsSection() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reviews')
      .then((response) => (response.ok ? response.json() : { reviews: [] }))
      .then((data) => {
        if (!cancelled) setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!reviews || reviews.length === 0) return null;

  const scrollBy = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * (track.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <Section id={testimonials.id} tone="subtle" aria-labelledby="avis-title">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow={testimonials.eyebrow}
            title={testimonials.title}
            align="left"
            id="avis-title"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Avis précédent"
              className="grid size-10 place-items-center rounded-lg border border-line bg-surface text-foreground transition-colors hover:bg-muted"
            >
              <span aria-hidden="true" className="rotate-180">
                <Icon name="ArrowRight" className="size-4" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Avis suivant"
              className="grid size-10 place-items-center rounded-lg border border-line bg-surface text-foreground transition-colors hover:bg-muted"
            >
              <Icon name="ArrowRight" className="size-4" />
            </button>
          </div>
        </div>

        <Reveal delay={60} className="mt-8">
          <div
            ref={trackRef}
            role="region"
            aria-label="Avis des écoles"
            tabIndex={0}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]"
          >
            {reviews.slice(0, 12).map((review) => (
              <article
                key={review.id}
                className="w-[86%] shrink-0 snap-start rounded-xl border border-line bg-surface p-5 sm:w-[46%] lg:w-[31.5%]"
              >
                <div className="flex items-center gap-1.5" aria-label={`${review.rating} étoiles sur 5`}>
                  <Icon name="Check" className="size-4 text-signal" strokeWidth={2} />
                  <span className="text-[13px] font-medium text-signal">Avis vérifié</span>
                  <span className="ml-auto text-[13px] text-muted-foreground">
                    {review.rating}/5
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground">« {review.message} »</p>
                <footer className="mt-4 border-t border-line pt-3">
                  <p className="text-sm font-semibold text-foreground">{review.author}</p>
                  {review.school && <p className="text-[13px] text-muted-foreground">{review.school}</p>}
                </footer>
              </article>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
