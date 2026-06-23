export const prerender = true;

import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import MarkdownIt from 'markdown-it';

const SITE = {
  title: 'Biscuits IA',
  description: 'Agir pour une Intelligence Artificielle éthique et solidaire',
  author: 'Biscuits IA',
  email: 'contact@biscuits-ia.com',
};

const parser = new MarkdownIt();

export async function GET(context) {
  const blog = await getCollection('blog', ({ data }) => {
    return !data.draft;
  });

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: blog.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description || '',
      link: `/blog/${post.id}/`,
      content: sanitizeHtml(parser.render(post.body), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
        allowedAttributes: {
          'img': ['src', 'alt', 'title'],
          'a': ['href', 'target', 'rel'],
          'p': ['class'],
          'h1': ['class'],
          'h2': ['class'],
          'h3': ['class'],
          'h4': ['class'],
          'h5': ['class'],
          'h6': ['class'],
          'ul': ['class'],
          'ol': ['class'],
          'li': ['class'],
          'blockquote': ['class'],
          'code': ['class'],
          'pre': ['class'],
        },
      }),
      customData: `
        <author>${SITE.author}</author>
        ${post.data.tags ? `<category>${post.data.tags.join('</category><category>')}</category>` : ''}
        ${post.data.thumbnail ? `<media:content url="${context.site}${post.data.thumbnail}" medium="image" />` : ''}
      `,
    })),
    customData: `
      <language>fr-FR</language>
      <managingEditor>${SITE.author} (${SITE.email})</managingEditor>
      <webMaster>${SITE.author} (${SITE.email})</webMaster>
      <image>
        <url>${context.site}/favicon.svg</url>
        <title>${SITE.title}</title>
        <link>${context.site}</link>
      </image>
    `,
  });
}
