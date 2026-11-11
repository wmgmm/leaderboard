import { Document, Page, View, Text, StyleSheet, Link } from '@react-pdf/renderer';
import type { UseCase } from '../../data/useCases';
import { CATEGORY_COLOR } from '../../data/categories';
import { CTA_CONTENT } from '../../data/ctaContent';
import { stripEmoji } from '../../lib/stripEmoji';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    padding: 48,
  },
  coverPage: {
    backgroundColor: '#ffffff',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 64,
  },
  coverEyebrow: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0071e3',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 40,
    fontFamily: 'Helvetica-Bold',
    color: '#1d1d1f',
    marginBottom: 8,
    lineHeight: 1.2,
  },
  coverSubtitle: {
    fontSize: 16,
    color: '#86868b',
    marginBottom: 48,
    lineHeight: 1.5,
  },
  coverDivider: {
    width: 48,
    height: 3,
    backgroundColor: '#0071e3',
    marginBottom: 40,
    borderRadius: 2,
  },
  coverCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 8,
  },
  coverCount: {
    fontSize: 56,
    fontFamily: 'Helvetica-Bold',
    color: '#1d1d1f',
  },
  coverCountLabel: {
    fontSize: 18,
    color: '#86868b',
  },
  coverMeta: {
    fontSize: 11,
    color: '#aeaeb2',
    marginTop: 48,
    lineHeight: 1.6,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  card: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f5f5f7',
    borderRadius: 10,
  },
  cardAccent: {
    width: 3,
    borderRadius: 2,
    marginRight: 12,
    alignSelf: 'stretch',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardBody: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  catBadge: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  cardId: {
    fontSize: 9,
    color: '#aeaeb2',
    fontFamily: 'Courier',
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1d1d1f',
    marginBottom: 4,
    lineHeight: 1.3,
  },
  cardDesc: {
    fontSize: 10,
    color: '#86868b',
    marginBottom: 10,
    lineHeight: 1.5,
  },
  promptBox: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 6,
  },
  promptLabel: {
    fontSize: 8,
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
  },
  promptText: {
    fontSize: 9,
    color: '#1d1d1f',
    fontFamily: 'Courier',
    lineHeight: 1.6,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 24,
    right: 48,
    fontSize: 9,
    color: '#aeaeb2',
  },
  ctaPage: {
    backgroundColor: '#ffffff',
    padding: 64,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  ctaEyebrow: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0071e3',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  ctaHeading: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#1d1d1f',
    marginBottom: 8,
    lineHeight: 1.2,
  },
  ctaIntro: {
    fontSize: 12,
    color: '#86868b',
    marginBottom: 36,
    lineHeight: 1.6,
  },
  ctaSection: {
    marginBottom: 24,
    paddingLeft: 16,
    borderLeft: '3px solid #f5f5f7',
  },
  ctaSectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1d1d1f',
    marginBottom: 4,
  },
  ctaSectionBody: {
    fontSize: 10,
    color: '#86868b',
    lineHeight: 1.6,
    marginBottom: 5,
  },
  ctaLink: {
    fontSize: 10,
    color: '#0071e3',
  },
  ctaDivider: {
    height: 1,
    backgroundColor: '#f5f5f7',
    marginVertical: 24,
  },
  ctaContactLine: {
    fontSize: 10,
    color: '#86868b',
    marginBottom: 4,
    lineHeight: 1.5,
  },
});

interface Props {
  cases: UseCase[];
}

export function PlaybookDocument({ cases }: Props) {
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const CARDS_PER_PAGE = 3;
  const pages: UseCase[][] = [];
  for (let i = 0; i < cases.length; i += CARDS_PER_PAGE) {
    pages.push(cases.slice(i, i + CARDS_PER_PAGE));
  }

  return (
    <Document
      title="Community Top of the Prompts: my picks"
      author="The Matts, Cardiff University"
      subject="The prompts you loved"
    >
      {/* Cover */}
      <Page size="A4" style={[styles.page, styles.coverPage]}>
        <Text style={styles.coverEyebrow}>AI in the Workplace</Text>
        <Text style={styles.coverTitle}>Your Top of the{'\n'}Prompts Picks</Text>
        <Text style={styles.coverSubtitle}>The prompts you loved in the{'\n'}Cardiff University workshop</Text>
        <View style={styles.coverDivider} />
        <View style={styles.coverCountRow}>
          <Text style={styles.coverCount}>{cases.length}</Text>
          <Text style={styles.coverCountLabel}>prompts loved</Text>
        </View>
        <Text style={styles.coverMeta}>Generated {today}</Text>
      </Page>

      {/* Use case pages */}
      {pages.map((pageCases, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          <Text style={styles.sectionLabel}>Your loved prompts</Text>
          {pageCases.map(uc => {
            const color = CATEGORY_COLOR[uc.cat] || '#0071e3';
            return (
              <View key={uc.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={[styles.cardAccent, { backgroundColor: color }]} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={[styles.catBadge, { color, backgroundColor: `${color}22` }]}>
                        {uc.cat}
                      </Text>
                    </View>
                    <Text style={styles.cardTitle}>{stripEmoji(uc.title)}</Text>
                    <Text style={styles.cardDesc}>{stripEmoji(uc.desc)}</Text>
                    <View style={styles.promptBox}>
                      <Text style={styles.promptLabel}>Prompt</Text>
                      <Text style={styles.promptText}>{uc.prompt}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
        </Page>
      ))}

      {/* CTA page */}
      <Page size="A4" style={[styles.page, styles.ctaPage]}>
        <Text style={styles.ctaEyebrow}>Cardiff University Workshop</Text>
        <Text style={styles.ctaHeading}>{CTA_CONTENT.heading}</Text>
        <Text style={styles.ctaIntro}>{CTA_CONTENT.intro}</Text>

        <View style={styles.ctaSection}>
          <Text style={styles.ctaSectionTitle}>{CTA_CONTENT.shareWorkshop.title}</Text>
          <Text style={styles.ctaSectionBody}>{CTA_CONTENT.shareWorkshop.body}</Text>
          <Link src={CTA_CONTENT.shareWorkshop.linkHref} style={styles.ctaLink}>
            {CTA_CONTENT.shareWorkshop.linkLabel} {'>'}
          </Link>
        </View>

        <View style={styles.ctaSection}>
          <Text style={styles.ctaSectionTitle}>{CTA_CONTENT.trainTheTrainer.title}</Text>
          <Text style={styles.ctaSectionBody}>{CTA_CONTENT.trainTheTrainer.body}</Text>
          <Link src={CTA_CONTENT.trainTheTrainer.linkHref} style={styles.ctaLink}>
            {CTA_CONTENT.trainTheTrainer.linkLabel} {'>'}
          </Link>
        </View>

        <View style={styles.ctaSection}>
          <Text style={styles.ctaSectionTitle}>{CTA_CONTENT.governance.title}</Text>
          <Text style={styles.ctaSectionBody}>{CTA_CONTENT.governance.body}</Text>
          <Link src={CTA_CONTENT.governance.linkHref} style={styles.ctaLink}>
            {CTA_CONTENT.governance.linkLabel} {'>'}
          </Link>
        </View>

        <View style={styles.ctaDivider} />

        <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>{CTA_CONTENT.contact.heading}</Text>
        <Text style={styles.ctaContactLine}>{CTA_CONTENT.contact.intro}</Text>
        {CTA_CONTENT.contact.people.map(p => (
          <Text key={p.email} style={styles.ctaContactLine}>
            {p.name}:{' '}
            <Link src={`mailto:${p.email}`} style={styles.ctaLink}>{p.email}</Link>
          </Text>
        ))}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
