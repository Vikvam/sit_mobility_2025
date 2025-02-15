#!/usr/bin/env fish
tar -cz **.{css,html,js,map} -f site.tar.gz
hut pages publish -d dojezdnik.adamator.eu site.tar.gz
rm site.tar.gz
