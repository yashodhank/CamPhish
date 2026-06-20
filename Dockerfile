FROM php:8.2-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    unzip \
    curl \
    jq \
    ca-certificates \
    apache2-utils \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install -j$(nproc) gd

RUN a2enmod rewrite headers

COPY docker/apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/camphish.ini

RUN mkdir -p /var/www/html/templates /var/www/html/stream /data/captures /data/locations /data/logs /data/config /data/templates/ai-generated \
    && chown -R www-data:www-data /var/www/html /data \
    && chmod -R 755 /var/www/html /data

COPY app/public/ /var/www/html/
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/data/captures", "/data/locations", "/data/logs", "/data/config"]

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["apache2-foreground"]
